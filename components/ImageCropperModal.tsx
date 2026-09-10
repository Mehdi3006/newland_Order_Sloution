import React, { useState, useRef, useEffect, useCallback } from 'react';
import { useTranslation } from 'react-i18next';
import Select from './Select';

interface ImageCropperModalProps {
  isOpen: boolean;
  src: string | null;
  onClose: () => void;
  onCropComplete: (croppedImageUrl: string) => void;
}

const clamp = (val: number, min: number, max: number) => Math.max(min, Math.min(val, max));

const ImageCropperModal: React.FC<ImageCropperModalProps> = ({ isOpen, src, onClose, onCropComplete }) => {
    const { t } = useTranslation();
    const canvasRef = useRef<HTMLCanvasElement>(null);
    const containerRef = useRef<HTMLDivElement>(null);
    
    // State for image element and dimensions
    const [image, setImage] = useState<HTMLImageElement | null>(null);
    const [containerSize, setContainerSize] = useState(0);

    // State for crop transformations
    const [zoom, setZoom] = useState(1);
    const [minZoom, setMinZoom] = useState(1);
    const [offset, setOffset] = useState({ x: 0, y: 0 });
    const [outputResolution, setOutputResolution] = useState(512);
    
    // State for user interaction
    const [isDragging, setIsDragging] = useState(false);
    const [dragStart, setDragStart] = useState({ x: 0, y: 0 });

    // Step 1: Load the image element when src is provided
    useEffect(() => {
        if (isOpen && src) {
            const img = new Image();
            img.onload = () => setImage(img);
            img.onerror = () => {
                console.error("Failed to load image for cropping.");
                setImage(null);
            };
            img.src = src;
        } else {
            // Reset everything when modal is closed or src is removed
            setImage(null);
            setContainerSize(0);
            setZoom(1);
            setMinZoom(1);
            setOffset({ x: 0, y: 0 });
            setOutputResolution(512); // Reset to default
        }
    }, [isOpen, src]);

    // Step 2: Measure the container when it's mounted
    useEffect(() => {
        if (isOpen && containerRef.current) {
            const resizeObserver = new ResizeObserver(entries => {
                if (entries[0]?.contentRect.width > 0) {
                    setContainerSize(entries[0].contentRect.width);
                }
            });
            resizeObserver.observe(containerRef.current);
            return () => resizeObserver.disconnect();
        }
    }, [isOpen]);

    // Step 3: Calculate initial zoom and offset once both image and container are ready
    useEffect(() => {
        if (image && containerSize > 0) {
            const { naturalWidth, naturalHeight } = image;
            if (naturalWidth > 0 && naturalHeight > 0) {
                // "Contain" logic: ensure the entire image is visible inside the container.
                const containZoom = Math.min(containerSize / naturalWidth, containerSize / naturalHeight);
                
                setZoom(containZoom);
                // The user can only zoom IN from this "contain" state.
                setMinZoom(containZoom); 
                setOffset({ x: 0, y: 0 });
            }
        }
    }, [image, containerSize]);

    // This function calculates the valid panning range to prevent empty space
    const getClampedOffset = useCallback((newOffset: {x: number, y: number}, currentZoom: number) => {
        if (!image || containerSize === 0) return { x: 0, y: 0 };
        
        const displayedWidth = image.naturalWidth * currentZoom;
        const displayedHeight = image.naturalHeight * currentZoom;

        const maxX = Math.max(0, (displayedWidth - containerSize) / 2);
        const maxY = Math.max(0, (displayedHeight - containerSize) / 2);
        
        return {
            x: clamp(newOffset.x, -maxX, maxX),
            y: clamp(newOffset.y, -maxY, maxY)
        };
    }, [image, containerSize]);
    
    // Re-clamp the offset whenever the zoom level changes
    useEffect(() => {
        setOffset(prevOffset => getClampedOffset(prevOffset, zoom));
    }, [zoom, getClampedOffset]);

    const handleMouseDown = (e: React.MouseEvent<HTMLDivElement>) => {
        if (!image) return;
        e.preventDefault();
        setIsDragging(true);
        setDragStart({ x: e.clientX, y: e.clientY });
    };

    const handleMouseMove = useCallback((e: MouseEvent) => {
        if (isDragging) {
            const dx = e.clientX - dragStart.x;
            const dy = e.clientY - dragStart.y;
            setOffset(prev => getClampedOffset({ x: prev.x + dx, y: prev.y + dy }, zoom));
            setDragStart({ x: e.clientX, y: e.clientY });
        }
    }, [isDragging, dragStart, getClampedOffset, zoom]);

    const handleMouseUp = useCallback(() => {
        setIsDragging(false);
    }, []);

    useEffect(() => {
        if (isDragging) {
            window.addEventListener('mousemove', handleMouseMove);
            window.addEventListener('mouseup', handleMouseUp);
            window.addEventListener('mouseleave', handleMouseUp);
        }
        return () => {
            window.removeEventListener('mousemove', handleMouseMove);
            window.removeEventListener('mouseup', handleMouseUp);
            window.removeEventListener('mouseleave', handleMouseUp);
        };
    }, [isDragging, handleMouseMove, handleMouseUp]);
    
    const handleWheel = (e: React.WheelEvent<HTMLDivElement>) => {
        if (!image) return;
        e.preventDefault();
        const newZoom = clamp(zoom - e.deltaY * 0.005, minZoom, 5);
        setZoom(newZoom);
    };

    const handleCrop = () => {
        const canvas = canvasRef.current;
        if (!image || !canvas || containerSize === 0) return;

        const ctx = canvas.getContext('2d');
        if (!ctx) return;
        
        const outputSize = outputResolution;
        canvas.width = outputSize;
        canvas.height = outputSize;

        // Clear canvas with white background (for letterboxing)
        ctx.fillStyle = 'white';
        ctx.fillRect(0, 0, outputSize, outputSize);

        const { naturalWidth, naturalHeight } = image;
        const displayedWidth = naturalWidth * zoom;
        const displayedHeight = naturalHeight * zoom;
        
        // Position of image top-left relative to container top-left
        const imageLeftInContainer = (containerSize - displayedWidth) / 2 + offset.x;
        const imageTopInContainer = (containerSize - displayedHeight) / 2 + offset.y;

        // Calculate the intersection of the image and the container (crop area)
        const intersectX_container = Math.max(0, imageLeftInContainer);
        const intersectY_container = Math.max(0, imageTopInContainer);
        const intersectWidth_container = Math.min(containerSize, imageLeftInContainer + displayedWidth) - intersectX_container;
        const intersectHeight_container = Math.min(containerSize, imageTopInContainer + displayedHeight) - intersectY_container;

        // Only draw if there is an intersection
        if (intersectWidth_container > 0 && intersectHeight_container > 0) {
            // Map intersection from container coordinates to source image coordinates
            const sx = (intersectX_container - imageLeftInContainer) / zoom;
            const sy = (intersectY_container - imageTopInContainer) / zoom;
            const sWidth = intersectWidth_container / zoom;
            const sHeight = intersectHeight_container / zoom;

            // Map intersection from container coordinates to destination canvas coordinates
            const scale = outputSize / containerSize;
            const dx = intersectX_container * scale;
            const dy = intersectY_container * scale;
            const dWidth = intersectWidth_container * scale;
            const dHeight = intersectHeight_container * scale;
            
            ctx.drawImage(
                image,
                sx, sy,
                sWidth, sHeight,
                dx, dy,
                dWidth, dHeight
            );
        }
        
        const croppedImageUrl = canvas.toDataURL('image/png');
        onCropComplete(croppedImageUrl);
    };

    const isReady = image && containerSize > 0;

    return (
        <div className={`fixed inset-0 bg-black/70 z-[80] flex items-center justify-center p-4 transition-opacity duration-300 ${isOpen ? 'opacity-100' : 'opacity-0 pointer-events-none'}`} onClick={onClose}>
            <div className="bg-white rounded-xl shadow-2xl w-full max-w-lg flex flex-col" onClick={e => e.stopPropagation()}>
                <header className="p-4 border-b border-slate-200">
                    <h2 className="text-lg font-bold text-gray-800">{t('imageCropper.title')}</h2>
                </header>
                <main className="p-6">
                    <div
                        ref={containerRef}
                        className="w-full aspect-square bg-slate-800 overflow-hidden relative cursor-move select-none rounded-md"
                        onMouseDown={handleMouseDown}
                        onWheel={handleWheel}
                    >
                        {image && (
                            <div
                                className="absolute bg-no-repeat bg-center"
                                style={{
                                    width: image.naturalWidth,
                                    height: image.naturalHeight,
                                    backgroundImage: `url(${image.src})`,
                                    backgroundSize: '100% 100%',
                                    opacity: isReady ? 1 : 0,
                                    transition: 'opacity 0.2s',
                                    transform: `translate(-50%, -50%) translate(${offset.x}px, ${offset.y}px) scale(${zoom})`,
                                    top: '50%',
                                    left: '50%',
                                }}
                            />
                        )}
                         <div className="absolute inset-0 border-4 border-white/50 pointer-events-none box-border shadow-[0_0_0_9999px_rgba(0,0,0,0.5)]"></div>
                    </div>
                    <div className="mt-4 flex items-center gap-x-4">
                        <label htmlFor="zoom-slider" className="text-sm font-medium text-slate-700">{t('imageCropper.zoom')}</label>
                        <input
                            id="zoom-slider"
                            type="range"
                            min={minZoom}
                            max={5}
                            step="0.01"
                            value={zoom}
                            onChange={(e) => setZoom(parseFloat(e.target.value))}
                            className="w-full"
                            disabled={!isReady}
                        />
                    </div>
                </main>
                 <canvas ref={canvasRef} className="hidden"></canvas>
                <footer className="p-4 bg-slate-50 rounded-b-xl flex justify-between items-center">
                    <div className="flex items-center gap-x-2">
                         <label htmlFor="quality-select" className="text-sm font-medium text-slate-700">{t('imageCropper.outputQuality')}:</label>
                         <Select id="quality-select" value={outputResolution} onChange={e => setOutputResolution(Number(e.target.value))}>
                            <option value={512}>{t('imageCropper.qualityStandard')}</option>
                            <option value={1024}>{t('imageCropper.qualityHigh')}</option>
                            <option value={2048}>{t('imageCropper.qualityUltra')}</option>
                        </Select>
                    </div>
                    <div className="flex justify-end gap-x-3">
                        <button type="button" onClick={onClose} className="bg-slate-200 text-slate-800 px-4 py-2 rounded-md hover:bg-slate-300">{t('common.cancel')}</button>
                        <button type="button" onClick={handleCrop} disabled={!isReady} className="bg-indigo-600 text-white px-4 py-2 rounded-md hover:bg-indigo-700 disabled:bg-indigo-300">{t('imageCropper.cropAndAdd')}</button>
                    </div>
                </footer>
            </div>
        </div>
    );
};

export default ImageCropperModal;