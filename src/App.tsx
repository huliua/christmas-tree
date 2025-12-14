import React, { useState, Suspense, useContext, useEffect, useRef } from 'react';
import { TreeContextType, AppState, TreeContext, PointerCoords } from './types';
import Experience from './components/Experience';
import GestureInput from './components/GestureInput';
import { AnimatePresence, motion } from 'framer-motion';


// --- 梦幻光标组件 ---
const DreamyCursor: React.FC<{ pointer: PointerCoords | null, progress: number }> = ({ pointer, progress }) => {
    if (!pointer) return null;
    return (
        <motion.div
            className="fixed top-0 left-0 pointer-events-none z-[200]"
            initial={{ opacity: 0, scale: 0 }}
            animate={{
                opacity: 1,
                scale: 1,
                left: `${pointer.x * 100}%`,
                top: `${pointer.y * 100}%`
            }}
            exit={{ opacity: 0, scale: 0 }}
            transition={{ duration: 0.1, ease: "easeOut" }}
            style={{ x: "-50%", y: "-50%" }}
        >
            {/* 核心光点 - 增强版 */}
            <div className="relative flex items-center justify-center">
                <div className="w-4 h-4 bg-white rounded-full shadow-[0_0_15px_#fcd34d] z-10" />
                {/* 瞄准环 */}
                <div className="absolute w-8 h-8 border border-white/60 rounded-full" />
            </div>

            {/* 粒子拖尾装饰 (CSS 动画) */}
            <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-24 h-24 bg-gradient-to-r from-emerald-500/10 to-amber-500/10 rounded-full blur-xl animate-pulse"></div>
        </motion.div>
    );
};

// --- 背景音乐组件 ---
const BackgroundMusic: React.FC = () => {
    const [muted, setMuted] = useState(false); // Default ON (try autoplay)
    const audioRef = useRef<HTMLAudioElement | null>(null);

    // Keyboard listener for Spacebar
    useEffect(() => {
        const handleKeyDown = (e: KeyboardEvent) => {
            if (e.code === 'Space') {
                e.preventDefault(); // Prevent scrolling
                setMuted(prev => !prev);
            }
        };
        window.addEventListener('keydown', handleKeyDown);
        return () => window.removeEventListener('keydown', handleKeyDown);
    }, []);

    useEffect(() => {
        if (audioRef.current) {
            audioRef.current.volume = 0.4;
            if (!muted) {
                const playPromise = audioRef.current.play();
                if (playPromise !== undefined) {
                    playPromise.catch(e => {
                        console.log("Auto-play was prevented by browser policy. User interaction required.");
                        // Optionally setMuted(true) here if you want to reflect reality,
                        // but keeping it false allows it to start on first click elsewhere if logic permits.
                    });
                }
            } else {
                audioRef.current.pause();
            }
        }
    }, [muted]);

    return (
        <div className="absolute top-8 right-8 z-50">
             <audio
                ref={audioRef}
                src="/music/music.mp3"
                loop
                autoPlay // Try attribute-based autoplay too
            />
            <button
                onClick={() => setMuted(!muted)}
                className="p-3 bg-black/40 backdrop-blur-md border border-white/20 rounded-full hover:bg-white/10 transition-colors group"
                title="Toggle Music (Space)"
            >
                {muted ? (
                    <span className="text-2xl opacity-70 group-hover:opacity-100">🔇</span>
                ) : (
                    <span className="text-2xl opacity-70 group-hover:opacity-100 animate-pulse">🎵</span>
                )}
            </button>
        </div>
    );
};

// --- 照片弹窗 ---
const PhotoModal: React.FC<{ url: string | null, onClose: () => void }> = ({ url, onClose }) => {
    if (!url) return null;
    return (
        <motion.div
            id="photo-modal-backdrop"
            initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
            className="fixed inset-0 z-[100] bg-black/90 flex items-center justify-center p-8 backdrop-blur-sm"
            onClick={onClose}
        >
            <motion.div
                initial={{ scale: 0.8, y: 50, rotate: -5 }}
                animate={{ scale: 1, y: 0, rotate: 0 }}
                exit={{ scale: 0.5, opacity: 0, y: 100 }}
                transition={{ type: "spring", stiffness: 300, damping: 20 }}
                className="relative max-w-4xl max-h-full bg-white p-3 rounded shadow-[0_0_50px_rgba(255,215,0,0.3)] border-8 border-white"
                onClick={(e) => e.stopPropagation()}
            >
                <img src={url} alt="Memory" className="max-h-[80vh] object-contain rounded shadow-inner" />
                <div className="absolute -bottom-12 w-full text-center text-red-300/70 cinzel text-sm">
                    ❄️ Precious Moment ❄️ Tap to close
                </div>
            </motion.div>
        </motion.div>
    );
}

const AppContent: React.FC = () => {
    const { state, setState, webcamEnabled, setWebcamEnabled, pointer, hoverProgress, selectedPhotoUrl, setSelectedPhotoUrl, clickTrigger, setLastCloseTime, hoveredPhotoId, lastCloseTime } = useContext(TreeContext) as TreeContextType;

    useEffect(() => {
        // Skip initial mount or invalid trigger
        if (clickTrigger === 0) return;

        // Centralized Click Logic
        if (selectedPhotoUrl) {
            // Priority 1: Close if open
            setSelectedPhotoUrl(null);
            setLastCloseTime(Date.now());
        } else if (hoveredPhotoId) {
            // Priority 2: Open if hovering a photo (and not in cooldown)
            if (Date.now() - lastCloseTime > 500) {
                setSelectedPhotoUrl(hoveredPhotoId);
            }
        }
    }, [clickTrigger]);

    return (
        <main className="relative w-full h-screen bg-black text-white overflow-hidden cursor-none">
            <BackgroundMusic />

            {/* 摄像头背景层 (z-0) - NOW REPOSITIONED IN COMPONENT */}
            {webcamEnabled && <GestureInput />}

            {/* 3D 场景层 (z-10) */}
            <div className="absolute inset-0 z-10">
                <Suspense fallback={<div className="flex items-center justify-center h-full text-red-400 cinzel animate-pulse text-2xl">🎄 Loading Christmas Magic... ❄️</div>}>
                    <Experience />
                </Suspense>
            </div>

            {/* 光标层 (z-200) */}
            <DreamyCursor pointer={pointer} progress={hoverProgress} />

            {/* 弹窗层 (z-100) */}
            <AnimatePresence>
                {selectedPhotoUrl && <PhotoModal url={selectedPhotoUrl} onClose={() => { setSelectedPhotoUrl(null); setLastCloseTime(Date.now()); }} />}
            </AnimatePresence>
        </main>
    );
};

const App: React.FC = () => {
    const [state, setState] = useState<AppState>('CHAOS');
    const [rotationSpeed, setRotationSpeed] = useState<number>(0.3); // 固定基础旋转速度
    const [rotationBoost, setRotationBoost] = useState<number>(0); // 额外加速度
    const [webcamEnabled, setWebcamEnabled] = useState<boolean>(true);
    const [pointer, setPointer] = useState<PointerCoords | null>(null);
    const [hoverProgress, setHoverProgress] = useState<number>(0);
    const [clickTrigger, setClickTrigger] = useState<number>(0);
    const [selectedPhotoUrl, setSelectedPhotoUrl] = useState<string | null>(null);
    const [panOffset, setPanOffset] = useState<{ x: number, y: number }>({ x: 0, y: 0 });
    const [zoomOffset, setZoomOffset] = useState<number>(0);
    const [lastCloseTime, setLastCloseTime] = useState<number>(0);
    const [hoveredPhotoId, setHoveredPhotoId] = useState<string | null>(null);

    return (
        <TreeContext.Provider value={{
            state, setState,
            rotationSpeed, setRotationSpeed,
            webcamEnabled, setWebcamEnabled,
            pointer, setPointer,
            hoverProgress, setHoverProgress,
            clickTrigger, setClickTrigger,
            selectedPhotoUrl, setSelectedPhotoUrl,
            panOffset, setPanOffset,
            rotationBoost, setRotationBoost,
            zoomOffset, setZoomOffset,
            lastCloseTime, setLastCloseTime,
            hoveredPhotoId, setHoveredPhotoId
        }}>
            <AppContent />
        </TreeContext.Provider>
    );
};

export default App;