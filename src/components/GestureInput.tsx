import React, { useEffect, useRef, useContext, useState } from 'react';
import { FilesetResolver, GestureRecognizer, DrawingUtils, NormalizedLandmark } from '@mediapipe/tasks-vision';
import { TreeContext, TreeContextType } from '../types';

const GestureInput: React.FC = () => {
  const videoRef = useRef<HTMLVideoElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);

  const { setState, setRotationSpeed, setRotationBoost, setPointer, state: appState, setHoverProgress, setClickTrigger, selectedPhotoUrl, setPanOffset, setZoomOffset } = useContext(TreeContext) as TreeContextType;

  const stateRef = useRef(appState);
  const photoRef = useRef(selectedPhotoUrl);

  useEffect(() => {
    stateRef.current = appState;
    photoRef.current = selectedPhotoUrl;
  }, [appState, selectedPhotoUrl]);

  const [loading, setLoading] = useState(true);

  const recognizerRef = useRef<GestureRecognizer | null>(null);
  const requestRef = useRef<number | null>(null);
  const lastVideoTime = useRef<number>(-1);
  const gestureStreak = useRef<{ name: string | null; count: number; lastStable: string | null }>({ name: null, count: 0, lastStable: null });

  const lastFrameTimeRef = useRef<number>(0);
  const clickCooldownRef = useRef<number>(0);
  const lastPointingTimeRef = useRef<number>(0);
  const lastPointerPosRef = useRef<{ x: number, y: number } | null>(null);

  // 记录上一帧手掌中心位置，用于计算位移差
  const lastPalmPos = useRef<{ x: number, y: number } | null>(null);
  // 记录上一帧双手距离，用于缩放
  const lastHandDistance = useRef<number | null>(null);
  // 记录上一帧单手尺寸，用于单手缩放
  const lastHandScale = useRef<number | null>(null);

  const isExtended = (landmarks: NormalizedLandmark[], tipIdx: number, mcpIdx: number, wrist: NormalizedLandmark) => {
    const tipDist = Math.hypot(landmarks[tipIdx].x - wrist.x, landmarks[tipIdx].y - wrist.y);
    const mcpDist = Math.hypot(landmarks[mcpIdx].x - wrist.x, landmarks[mcpIdx].y - wrist.y);
    return tipDist > mcpDist * 1.3;
  };

  useEffect(() => {
    let mounted = true;
    const setupMediaPipe = async () => {
      try {
        // 1. Start Camera Access (Parallel)
        const streamPromise = navigator.mediaDevices.getUserMedia({
          video: { width: 320, height: 240, frameRate: { ideal: 30 } }
        });

        // 2. Start MediaPipe Loading (Parallel)
        const recognizerPromise = (async () => {
          const vision = await FilesetResolver.forVisionTasks(
            "/wasm"
          );
          return GestureRecognizer.createFromOptions(vision, {
            baseOptions: {
              modelAssetPath: "/models/gesture_recognizer.task",
              delegate: "GPU"
            },
            runningMode: "VIDEO",
            numHands: 2
          });
        })();

        // 3. Wait for both to complete
        const [stream, recognizer] = await Promise.all([streamPromise, recognizerPromise]);

        if (!mounted) return;

        recognizerRef.current = recognizer;

        if (videoRef.current) {
          videoRef.current.srcObject = stream;
          videoRef.current.onloadedmetadata = () => {
            videoRef.current?.play();
            if (canvasRef.current && videoRef.current) {
              canvasRef.current.width = videoRef.current.videoWidth;
              canvasRef.current.height = videoRef.current.videoHeight;
            }
            setLoading(false);
            lastFrameTimeRef.current = Date.now();
            predictWebcam();
          };
        }
      } catch (error) {
        console.error("Error initializing MediaPipe:", error);
        setLoading(false);
      }
    };
    setupMediaPipe();
    return () => {
      mounted = false;
      if (requestRef.current !== null) cancelAnimationFrame(requestRef.current);
      if (videoRef.current && videoRef.current.srcObject) {
        const stream = videoRef.current.srcObject as MediaStream;
        stream.getTracks().forEach(track => track.stop());
      }
    };
  }, []);

  const predictWebcam = () => {
    const now = Date.now();
    const delta = (now - lastFrameTimeRef.current) / 1000;
    lastFrameTimeRef.current = now;

    const currentState = stateRef.current;
    const isPhotoOpen = !!photoRef.current;

    const video = videoRef.current;
    const canvas = canvasRef.current;
    const recognizer = recognizerRef.current;

    if (video && recognizer && canvas) {
      if (video.currentTime !== lastVideoTime.current) {
        lastVideoTime.current = video.currentTime;
        const results = recognizer.recognizeForVideo(video, Date.now());
        const ctx = canvas.getContext("2d");

        let detectedColor = "rgba(0, 255, 255, 0.2)"; // 默认霓虹青色，降低透明度
        let currentPointer = null;
        let isPointing = false;
        let isPanning = false;
        let isZooming = false;

        if (results.landmarks && results.landmarks.length > 0) {
          const landmarks = results.landmarks[0];
          const wrist = landmarks[0];

          // 1. Gesture Basics
          const indexTip = landmarks[8];
          const thumbTip = landmarks[4];
          
          // Pinch Distance (Thumb to Index)
          const pinchDist = Math.hypot(indexTip.x - thumbTip.x, indexTip.y - thumbTip.y);
          const isPinching = pinchDist < 0.08;

          // State Switching Gestures
          // Only check name if confidence is high
          let name: string | null = null;
          let score = 0;
          if (results.gestures.length > 0 && results.gestures[0].length > 0) {
            name = results.gestures[0][0].categoryName;
            score = results.gestures[0][0].score;
          }
          if (score < 0.5) name = null;

          // 2. Pointer Tracking (Always Index Tip)
          // Exception: Closed Fist disables pointer to prevent chaos
          if (name !== 'Closed_Fist') {
             currentPointer = { x: 1.0 - indexTip.x, y: indexTip.y };
          }

          // 3. Palm Movement (Rotation) logic
          const palmX = (landmarks[0].x + landmarks[5].x + landmarks[17].x) / 3;
          const palmY = (landmarks[0].y + landmarks[5].y + landmarks[17].y) / 3;
          let dx = 0;
          let dy = 0;
          if (lastPalmPos.current) {
            dx = (1.0 - palmX) - (1.0 - lastPalmPos.current.x);
            dy = palmY - lastPalmPos.current.y;
          }
          lastPalmPos.current = { x: palmX, y: palmY };
          const isMoving = Math.abs(dx) > 0.005 || Math.abs(dy) > 0.005;

          // 4. State & Rotation Logic
          if (!isPhotoOpen) {
              if (name === 'Open_Palm') {
                 if (currentState === 'FORMED') {
                     if (gestureStreak.current.name === 'Open_Palm') {
                        gestureStreak.current.count++;
                        if (gestureStreak.current.count > 10) { 
                           setState('CHAOS');
                           gestureStreak.current.count = 0;
                        }
                     } else {
                        gestureStreak.current = { name: 'Open_Palm', count: 1, lastStable: null };
                     }
                     detectedColor = "rgba(255, 100, 100, 0.8)"; 
                 } else {
                     // CHAOS: Rotate
                     gestureStreak.current.count = 0;
                     if (Math.abs(dx) > 0.002) {
                        setRotationBoost(prev => {
                           const boost = prev - dx * 15.0; 
                           return Math.max(Math.min(boost, 5.0), -5.0);
                        });
                        detectedColor = "rgba(0, 200, 255, 0.9)"; 
                     }
                 }
              } else if (name === 'Closed_Fist' && currentState === 'CHAOS') {
                 if (gestureStreak.current.name === 'Closed_Fist') {
                    gestureStreak.current.count++;
                    if (gestureStreak.current.count > 5) {
                       setState('FORMED');
                       gestureStreak.current.count = 0;
                    }
                 } else {
                    gestureStreak.current = { name: 'Closed_Fist', count: 1, lastStable: null };
                 }
                 detectedColor = "rgba(100, 255, 100, 0.8)"; 
              } else {
                 if (gestureStreak.current.name && gestureStreak.current.name !== name) {
                     gestureStreak.current = { ...gestureStreak.current, count: 0 };
                 }
              }
          }

          // 5. Click Logic (Pinch)
          // Works in all states (to open or close)
          if (isPinching && name !== 'Closed_Fist') { // Guard against Fist triggering pinch
             if (clickCooldownRef.current <= 0) {
                 setClickTrigger(Date.now());
                 clickCooldownRef.current = 1.0; // Cooldown 1s
                 detectedColor = "rgba(255, 255, 0, 1.0)"; 
             }
          }
          
          if (clickCooldownRef.current > 0) {
             clickCooldownRef.current -= delta;
          }

        } else {
          // No hands
          setPointer(null);
          lastPalmPos.current = null;
        }

        setPointer(currentPointer);

        if (ctx) {
          ctx.clearRect(0, 0, canvas.width, canvas.height);
          // Optional: Draw skeleton
           if (results.landmarks && results.landmarks.length > 0) {
             const landmarks = results.landmarks[0];
             const drawingUtils = new DrawingUtils(ctx);
             drawingUtils.drawConnectors(landmarks, GestureRecognizer.HAND_CONNECTIONS, { color: detectedColor, lineWidth: 2 });
             drawingUtils.drawLandmarks(landmarks, { color: "rgba(255, 255, 255, 0.5)", lineWidth: 1, radius: 2 });
           }
        }
      }
    }
    requestRef.current = requestAnimationFrame(predictWebcam);
  };

  return (
    // 右上角小窗口布局
    <div className="fixed top-24 right-8 w-48 h-36 z-50 rounded-xl overflow-hidden border border-white/20 shadow-[0_0_20px_rgba(0,0,0,0.5)] bg-black/50 backdrop-blur-sm transition-opacity duration-300 hover:opacity-100 opacity-80">
      {/* 摄像头视频背景层 */}
      <video
        ref={videoRef}
        className="absolute inset-0 w-full h-full object-cover"
        playsInline
        muted
        autoPlay
        style={{ transform: 'scaleX(-1)' }}
      />

      {/* 手势骨架线画布 */}
      <canvas
        ref={canvasRef}
        className="absolute inset-0 w-full h-full object-cover"
        style={{ transform: 'scaleX(-1)' }}
      />

      {loading && (
        <div className="absolute inset-0 flex items-center justify-center text-xs text-emerald-500 animate-pulse bg-black/90 cinzel">
          INIT...
        </div>
      )}
      
      {/* 状态指示器 */}
      <div className="absolute bottom-1 left-2 text-[10px] text-white/70 cinzel">
         {appState} MODE
      </div>
    </div>
  );
};

export default GestureInput;