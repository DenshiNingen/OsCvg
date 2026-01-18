"use client";

import { useState, useRef, useEffect, useCallback } from "react";

interface ProcessedSignal {
  id: string;
  name: string;
  left: number[];
  right: number[];
}

interface AssetFile {
  id: string;
  file: File;
}

type Tab = 'single' | 'show';

const EditableValue = ({
  value,
  onChange,
  suffix = "",
  min,
  max,
  step = 1
}: {
  value: number,
  onChange: (v: number) => void,
  suffix?: string,
  min: number,
  max: number,
  step?: number
}) => {
  const [isEditing, setIsEditing] = useState(false);
  const [tempValue, setTempValue] = useState(value.toString());

  useEffect(() => {
    setTempValue(value.toString());
  }, [value]);

  const handleBlur = () => {
    let num = parseFloat(tempValue);
    if (isNaN(num)) num = value;
    num = Math.max(min, Math.min(max, num));
    onChange(num);
    setIsEditing(false);
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter') handleBlur();
    if (e.key === 'Escape') {
      setTempValue(value.toString());
      setIsEditing(false);
    }
  };

  if (isEditing) {
    return (
      <div className="flex justify-end items-center h-4">
        <input
          type="number"
          value={tempValue}
          onChange={(e) => setTempValue(e.target.value)}
          onBlur={handleBlur}
          onKeyDown={handleKeyDown}
          autoFocus
          min={min}
          max={max}
          step={step}
          className="w-14 h-4 text-[10px] bg-green-950 text-green-400 border border-green-700/50 rounded px-1 outline-none text-right tabular-nums no-spinner"
        />
      </div>
    );
  }

  return (
    <div
      onDoubleClick={() => setIsEditing(true)}
      title="Double click to edit"
      className="text-[10px] text-right font-bold tabular-nums cursor-text hover:text-green-400 decoration-dotted underline underline-offset-4 decoration-green-900 h-4 flex items-center justify-end"
    >
      {value.toFixed(step < 1 ? 1 : 0)}{suffix}
    </div>
  );
};

export default function Home() {
  const [activeTab, setActiveTab] = useState<Tab>('single');
  const [singleFile, setSingleFile] = useState<File | null>(null);
  const [showFiles, setShowFiles] = useState<AssetFile[]>([]);
  const [playlist, setPlaylist] = useState<ProcessedSignal[]>([]);
  const [singleSignal, setSingleSignal] = useState<ProcessedSignal | null>(null);

  const [isProcessing, setIsProcessing] = useState(false);
  const [isPlaying, setIsPlaying] = useState(false);

  // Settings
  const [refreshRate, setRefreshRate] = useState(60);
  const [transitSpeed, setTransitSpeed] = useState(20);
  const [showInterval, setShowInterval] = useState(5);
  const [animateDuration, setAnimateDuration] = useState(1);

  // Custom setter for Interval to handle clamping
  const updateShowInterval = (val: number) => {
    setShowInterval(val);
    if (animateDuration > val) {
      setAnimateDuration(val);
    }
  };
  const [wavDuration, setWavDuration] = useState(10);
  const [gain, setGain] = useState(1.0);

  // Timeline State
  const [currentTime, setCurrentTime] = useState(0); // Seconds
  const [draggedIndex, setDraggedIndex] = useState<number | null>(null);
  const currentTimeRef = useRef(0);
  const lastTimeRef = useRef(0);

  const canvasRef = useRef<HTMLCanvasElement>(null);
  const audioContextRef = useRef<AudioContext | null>(null);
  const scriptNodeRef = useRef<ScriptProcessorNode | null>(null);
  const gainNodeRef = useRef<GainNode | null>(null);

  const totalShowDuration = playlist.length * showInterval;

  const handleSingleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files && e.target.files[0]) {
      setSingleFile(e.target.files[0]);
      setSingleSignal(null);
      stopAudio();
    }
  };

  const handleShowFilesChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files) {
      const newAssets: AssetFile[] = Array.from(e.target.files).map(f => ({
        id: Math.random().toString(36).substr(2, 9),
        file: f
      }));
      setShowFiles(prev => [...prev, ...newAssets]);
      setPlaylist([]);
      stopAudio();
    }
  };

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    if (e.dataTransfer.files) {
      const dropped = Array.from(e.dataTransfer.files);
      if (activeTab === 'single') {
        setSingleFile(dropped[0]);
        setSingleSignal(null);
        stopAudio();
      } else {
        const newAssets: AssetFile[] = dropped.map(f => ({
          id: Math.random().toString(36).substr(2, 9),
          file: f
        }));
        setShowFiles(prev => [...prev, ...newAssets]);
        setPlaylist([]);
        stopAudio();
      }
    }
  };

  const removeShowFile = (index: number) => {
    setShowFiles(prev => prev.filter((_, i) => i !== index));
    setPlaylist([]);
    stopAudio();
  };

  const convertSingle = async () => {
    if (!singleFile) return;
    setIsProcessing(true);
    stopAudio();

    const formData = new FormData();
    formData.append("file", singleFile);
    formData.append("refresh_rate", refreshRate.toString());
    formData.append("transit_speed", transitSpeed.toString());

    try {
      const res = await fetch("/api", { method: "POST", body: formData });
      if (!res.ok) throw new Error("Conversion failed");
      const data = await res.json();
      if (data.error) throw new Error(data.error);

      setSingleSignal({
        id: 'single',
        name: singleFile.name,
        left: data.signal_left,
        right: data.signal_right,
      });
      setCurrentTime(0);
      currentTimeRef.current = 0;
    } catch (err) {
      console.error(err);
      alert("Error converting SVG");
    } finally {
      setIsProcessing(false);
    }
  };

  const convertShow = async () => {
    if (showFiles.length === 0) return;
    setIsProcessing(true);
    stopAudio();
    const newPlaylist: ProcessedSignal[] = [];

    for (const asset of showFiles) {
      const formData = new FormData();
      formData.append("file", asset.file);
      formData.append("refresh_rate", refreshRate.toString());
      formData.append("transit_speed", transitSpeed.toString());

      try {
        const res = await fetch("/api", { method: "POST", body: formData });
        if (!res.ok) throw new Error(`Failed: ${asset.file.name}`);
        const data = await res.json();
        newPlaylist.push({
          id: asset.id,
          name: asset.file.name,
          left: data.signal_left,
          right: data.signal_right,
        });
      } catch (err) {
        console.error(err);
      }
    }

    setPlaylist(newPlaylist);
    setCurrentTime(0);
    currentTimeRef.current = 0;
    setIsProcessing(false);
  };

  const onDragStart = (e: React.DragEvent, index: number) => {
    setDraggedIndex(index);
    e.dataTransfer.effectAllowed = "move";
  };

  const onDragOverItem = (e: React.DragEvent, index: number) => {
    e.preventDefault();
    if (draggedIndex === null || draggedIndex === index) return;

    const newFiles = [...showFiles];
    const item = newFiles[draggedIndex];
    newFiles.splice(draggedIndex, 1);
    newFiles.splice(index, 0, item);

    if (playlist.length === showFiles.length) {
      const newPlaylist = [...playlist];
      const pItem = newPlaylist[draggedIndex];
      newPlaylist.splice(draggedIndex, 1);
      newPlaylist.splice(index, 0, pItem);
      setPlaylist(newPlaylist);
    }

    setShowFiles(newFiles);
    setDraggedIndex(index);
  };

  const onDragEnd = () => {
    setDraggedIndex(null);
  };

  const initAudio = useCallback(() => {
    if (!audioContextRef.current) {
      audioContextRef.current = new (window.AudioContext || (window as any).webkitAudioContext)();
    }
    return audioContextRef.current;
  }, []);

  const stopAudio = useCallback(() => {
    if (scriptNodeRef.current) {
      scriptNodeRef.current.disconnect();
      scriptNodeRef.current = null;
    }
    setIsPlaying(false);
  }, []);

  const playAudio = useCallback(() => {
    const isSingle = activeTab === 'single';
    const hasData = isSingle ? !!singleSignal : playlist.length > 0;
    if (!hasData) return;

    const ctx = initAudio();
    if (ctx.state === 'suspended') ctx.resume();

    const scriptNode = ctx.createScriptProcessor(4096, 0, 2);
    let phase = 0;

    scriptNode.onaudioprocess = (e) => {
      const time = currentTimeRef.current;
      let currentSignal: ProcessedSignal | undefined;
      let progress = 1.0;

      if (activeTab === 'single') {
        currentSignal = singleSignal || undefined;
        progress = Math.min(1.0, time / animateDuration);
      } else {
        const idx = Math.floor(time / showInterval) % playlist.length;
        currentSignal = playlist[idx];
        const segmentTime = time % showInterval;
        progress = Math.min(1.0, segmentTime / animateDuration);
      }

      if (!currentSignal) return;

      const outL = e.outputBuffer.getChannelData(0);
      const outR = e.outputBuffer.getChannelData(1);
      const signalLen = currentSignal.left.length;

      for (let i = 0; i < outL.length; i++) {
        const signalIdx = phase % signalLen;
        if (signalIdx < signalLen * progress) {
          outL[i] = currentSignal.left[signalIdx];
          outR[i] = currentSignal.right[signalIdx];
        } else {
          outL[i] = 0;
          outR[i] = 0;
        }
        phase++;
      }
    };

    const gainNode = ctx.createGain();
    gainNode.gain.value = gain;
    scriptNode.connect(gainNode);
    gainNode.connect(ctx.destination);

    scriptNodeRef.current = scriptNode;
    gainNodeRef.current = gainNode;
    setIsPlaying(true);
    lastTimeRef.current = performance.now();
  }, [activeTab, singleSignal, playlist, initAudio, gain, animateDuration, showInterval]);

  useEffect(() => {
    if (gainNodeRef.current) {
      gainNodeRef.current.gain.value = gain;
    }
  }, [gain]);

  // Timeline Loop
  useEffect(() => {
    if (!isPlaying) return;

    let animId: number;
    const update = () => {
      const now = performance.now();
      const delta = (now - lastTimeRef.current) / 1000;
      lastTimeRef.current = now;

      const newTime = currentTimeRef.current + delta;

      if (activeTab === 'show' && newTime >= totalShowDuration) {
        currentTimeRef.current = 0;
      } else {
        currentTimeRef.current = newTime;
      }

      setCurrentTime(currentTimeRef.current);
      animId = requestAnimationFrame(update);
    };
    animId = requestAnimationFrame(update);
    return () => cancelAnimationFrame(animId);
  }, [isPlaying, activeTab, totalShowDuration]);

  // Visualization Loop
  useEffect(() => {
    const time = currentTime;
    let currentSignal: ProcessedSignal | undefined;
    let progress = 1.0;

    if (activeTab === 'single') {
      currentSignal = singleSignal || undefined;
      progress = Math.min(1.0, time / animateDuration);
    } else {
      if (playlist.length === 0) return;
      const idx = Math.floor(time / showInterval) % playlist.length;
      currentSignal = playlist[idx];
      const segmentTime = time % showInterval;
      progress = Math.min(1.0, segmentTime / animateDuration);
    }

    if (!currentSignal || !canvasRef.current) return;

    const canvas = canvasRef.current;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    ctx.fillStyle = "rgba(0, 10, 0, 0.4)";
    ctx.fillRect(0, 0, canvas.width, canvas.height);
    ctx.strokeStyle = "#00ff00";
    ctx.lineWidth = 2;
    ctx.beginPath();
    const cx = canvas.width / 2;
    const cy = canvas.height / 2;
    const scale = (Math.min(canvas.width, canvas.height) / 2.2) * gain;
    const len = currentSignal.left.length;
    const visibleLen = Math.floor(len * progress);

    if (visibleLen > 0) {
      ctx.moveTo(cx + currentSignal.left[0] * scale, cy - currentSignal.right[0] * scale);
      for (let i = 1; i < visibleLen; i++) {
        ctx.lineTo(cx + currentSignal.left[i] * scale, cy - currentSignal.right[i] * scale);
      }
    }
    ctx.stroke();
    ctx.shadowBlur = 10;
    ctx.shadowColor = "#00ff00";
    ctx.stroke();
    ctx.shadowBlur = 0;
  }, [currentTime, activeTab, singleSignal, playlist, showInterval, animateDuration, gain]);

  const togglePlay = () => {
    if (isPlaying) {
      stopAudio();
    } else {
      playAudio();
    }
  };

  const scrubTime = (time: number) => {
    currentTimeRef.current = time;
    setCurrentTime(time);
  };

  const downloadWav = () => {
    const isSingle = activeTab === 'single';
    const hasData = isSingle ? !!singleSignal : playlist.length > 0;
    if (!hasData) return;

    const sampleRate = 48000;
    const totalSamples = sampleRate * wavDuration;
    const bytesPerSample = 2;
    const channels = 2;
    const dataSize = totalSamples * channels * bytesPerSample;

    if (dataSize > 0xFFFFFFFF - 44) {
      alert("WAV limit exceeded (Max 4GB). Please reduce duration.");
      return;
    }

    try {
      const buffer = new ArrayBuffer(44 + dataSize);
      const view = new DataView(buffer);
      writeString(view, 0, 'RIFF');
      view.setUint32(4, 36 + dataSize, true);
      writeString(view, 8, 'WAVE');
      writeString(view, 12, 'fmt ');
      view.setUint32(16, 16, true);
      view.setUint16(20, 1, true);
      view.setUint16(22, channels, true);
      view.setUint32(24, sampleRate, true);
      view.setUint32(28, sampleRate * channels * bytesPerSample, true);
      view.setUint16(32, channels * bytesPerSample, true);
      view.setUint16(34, 16, true);
      writeString(view, 36, 'data');
      view.setUint32(40, dataSize, true);

      let offset = 44;

      for (let i = 0; i < totalSamples; i++) {
        const timeAtSample = i / sampleRate;
        let currentSignal: ProcessedSignal;
        let progress = 1.0;

        if (isSingle) {
          currentSignal = singleSignal!;
          progress = Math.min(1.0, timeAtSample / animateDuration);
        } else {
          const showLoopTime = totalShowDuration > 0 ? timeAtSample % totalShowDuration : 0; // Loop the entire show
          const idx = Math.floor(showLoopTime / showInterval) % playlist.length;
          currentSignal = playlist[idx];
          const segmentTime = showLoopTime % showInterval;
          progress = Math.min(1.0, segmentTime / animateDuration);
        }

        const left = currentSignal.left;
        const right = currentSignal.right;
        const len = left.length;

        // Calculate index within the signal for the current segment time
        // We use the segment time to determine where in the SVG loop we are
        const sigIdx = Math.floor((i % (sampleRate * (isSingle ? wavDuration : showInterval))) % len);

        if ((i % (sampleRate * (isSingle ? wavDuration : showInterval)) / sampleRate) < (isSingle ? wavDuration : showInterval) * progress) {
          let l = Math.max(-1, Math.min(1, left[sigIdx % len]));
          view.setInt16(offset, l < 0 ? l * 0x8000 : l * 0x7FFF, true);
          offset += 2;
          let r = Math.max(-1, Math.min(1, right[sigIdx % len]));
          view.setInt16(offset, r < 0 ? r * 0x8000 : r * 0x7FFF, true);
          offset += 2;
        } else {
          view.setInt16(offset, 0, true);
          offset += 2;
          view.setInt16(offset, 0, true);
          offset += 2;
        }
      }

      const blob = new Blob([buffer], { type: 'audio/wav' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      const namePart = isSingle ? singleSignal!.name : "compiled_show";
      a.download = `oscvg_${namePart.replace(/\.[^/.]+$/, "")}.wav`;
      a.click();
    } catch (e) {
      console.error(e);
      alert("Memory allocation failed.");
    }
  };

  const formatTime = (s: number) => {
    const h = Math.floor(s / 3600);
    const m = Math.floor((s % 3600) / 60);
    const sec = Math.floor(s % 60);
    return `${h > 0 ? h + ':' : ''}${m.toString().padStart(2, '0')}:${sec.toString().padStart(2, '0')}`;
  };

  return (
    <main className="min-h-screen bg-neutral-950 text-green-500 font-mono flex flex-col items-center p-4 md:p-8">
      <header className="w-full max-w-6xl flex justify-between items-end mb-8 border-b border-green-900/30 pb-4">
        <div>
          <h1 className="text-4xl font-bold tracking-tighter glow-text">OsCvg STUDIO</h1>
          <p className="text-xs opacity-50 mt-1 uppercase tracking-widest">SVG to Oscilloscope Art Generator</p>
        </div>
        <div className="flex gap-4">
          <button
            onClick={() => { setActiveTab('single'); stopAudio(); setCurrentTime(0); currentTimeRef.current = 0; }}
            className={`px-4 py-1 text-xs font-bold border rounded transition-all ${activeTab === 'single' ? 'bg-green-600 text-black border-green-500' : 'text-green-900 border-green-900/30'}`}
          >
            SINGLE
          </button>
          <button
            onClick={() => { setActiveTab('show'); stopAudio(); setCurrentTime(0); currentTimeRef.current = 0; }}
            className={`px-4 py-1 text-xs font-bold border rounded transition-all ${activeTab === 'show' ? 'bg-green-600 text-black border-green-500' : 'text-green-900 border-green-900/30'}`}
          >
            SHOW
          </button>
        </div>
      </header>

      <div className="w-full max-w-6xl grid grid-cols-1 lg:grid-cols-12 gap-8">

        {/* Left Column Controls */}
        <div className="lg:col-span-4 space-y-6">

          {/* File Management (Contextual) */}
          <section className="bg-neutral-900/50 border border-neutral-800 rounded-xl overflow-hidden min-h-[400px] flex flex-col">
            <div className="p-4 border-b border-neutral-800 flex justify-between items-center bg-neutral-900/80">
              <h2 className="text-xs font-bold uppercase tracking-widest">{activeTab === 'single' ? 'ASSET: SINGLE' : 'ASSETS: SHOW'}</h2>
              <button
                onClick={() => document.getElementById(activeTab === 'single' ? 'file-single' : 'file-show')?.click()}
                className="text-[10px] bg-green-900/20 hover:bg-green-700/50 px-2 py-1 rounded border border-green-800 transition-colors uppercase"
              >
                {activeTab === 'single' ? 'Set File' : 'Add Files'}
              </button>
            </div>

            <div className="flex-1 overflow-y-auto p-4" onDragOver={(e) => e.preventDefault()} onDrop={handleDrop}>
              {activeTab === 'single' ? (
                <div className="space-y-4">
                  <input id="file-single" type="file" accept=".svg" className="hidden" onChange={handleSingleFileChange} />
                  {singleFile ? (
                    <div className="p-4 border border-green-900/30 bg-green-900/5 rounded-lg text-center">
                      <p className="text-sm font-bold text-green-400 truncate">{singleFile.name}</p>
                      <p className="text-[10px] opacity-50 mt-1 uppercase">{(singleFile.size / 1024).toFixed(1)} KB</p>
                      {singleSignal && <p className="text-[10px] text-green-500 mt-2 font-bold tracking-widest">READY</p>}
                    </div>
                  ) : (
                    <div className="h-48 border-2 border-dashed border-neutral-800 rounded-lg flex flex-col items-center justify-center text-xs opacity-30 text-center px-4">
                      <p>Drop an SVG here</p>
                      <p className="text-[10px] mt-2">FOR SINGLE MODE PLAYBACK</p>
                    </div>
                  )}
                </div>
              ) : (
                <div className="space-y-2">
                  <input id="file-show" type="file" accept=".svg" multiple className="hidden" onChange={handleShowFilesChange} />
                  {showFiles.length === 0 ? (
                    <div className="h-48 border-2 border-dashed border-neutral-800 rounded-lg flex flex-col items-center justify-center text-xs opacity-30 text-center px-4">
                      <p>Drop SVG files here</p>
                      <p className="text-[10px] mt-2">TO BUILD A SHOW PLAYLIST</p>
                    </div>
                  ) : (
                    showFiles.map((f, i) => (
                      <div
                        key={f.id}
                        draggable
                        onDragStart={(e) => onDragStart(e, i)}
                        onDragOver={(e) => onDragOverItem(e, i)}
                        onDragEnd={onDragEnd}
                        onDrop={onDragEnd}
                        className={`flex justify-between items-center p-2 bg-neutral-900 border rounded text-xs cursor-grab active:cursor-grabbing transition-colors ${draggedIndex === i ? 'opacity-20 border-green-500' : 'border-neutral-800 hover:border-neutral-700'}`}
                      >
                        <span className="truncate opacity-50 flex items-center">
                          <span className="mr-3 opacity-20">⠿</span>
                          <span className="mr-2 w-4">{i + 1}</span>
                          {f.file.name}
                        </span>
                        <button onClick={() => removeShowFile(i)} className="text-neutral-600 hover:text-red-500 ml-2">✕</button>
                      </div>
                    ))
                  )}
                </div>
              )}
            </div>

            <div className="p-4 bg-neutral-900/80 border-t border-neutral-800 space-y-4">
              {activeTab === 'single' ? (
                <button
                  onClick={convertSingle}
                  disabled={!singleFile || isProcessing}
                  className={`w-full py-3 text-xs font-black rounded uppercase tracking-widest transition-all ${!singleFile ? 'bg-neutral-800 text-neutral-600' : 'bg-green-600 text-black shadow-[0_0_20px_rgba(0,255,0,0.2)] hover:bg-green-400'}`}
                >
                  {isProcessing ? 'Processing...' : (singleSignal ? 'RE-PROCESS SINGLE' : 'LOAD SINGLE ASSET')}
                </button>
              ) : (
                <button
                  onClick={convertShow}
                  disabled={showFiles.length === 0 || isProcessing}
                  className={`w-full py-3 text-xs font-black rounded uppercase tracking-widest transition-all ${showFiles.length === 0 ? 'bg-neutral-800 text-neutral-600' : 'bg-green-600 text-black shadow-[0_0_20px_rgba(0,255,0,0.2)] hover:bg-green-400'}`}
                >
                  {isProcessing ? 'Processing Show...' : (playlist.length > 0 ? 'UPDATE SHOW' : 'PREPARE SHOW')}
                </button>
              )}
            </div>
          </section>

          {/* Master Controls Section */}
          <section className="bg-neutral-900/80 border border-neutral-800 rounded-xl p-4 space-y-4">
            <h2 className="text-[10px] font-bold uppercase tracking-[0.2em] border-b border-neutral-800 pb-2 mb-4 opacity-50">Global Parameters</h2>
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-1">
                <label className="text-[9px] uppercase opacity-50">Refresh (Hz)</label>
                <input type="range" min="30" max="120" value={refreshRate} onChange={(e) => setRefreshRate(Number(e.target.value))} className="w-full accent-green-500 h-1" />
                <EditableValue value={refreshRate} onChange={setRefreshRate} min={30} max={120} />
              </div>
              <div className="space-y-1">
                <label className="text-[9px] uppercase opacity-50">Transit (x)</label>
                <input type="range" min="1" max="50" value={transitSpeed} onChange={(e) => setTransitSpeed(Number(e.target.value))} className="w-full accent-green-500 h-1" />
                <EditableValue value={transitSpeed} onChange={setTransitSpeed} min={1} max={50} />
              </div>
            </div>

            <div className="grid grid-cols-2 gap-4 pt-2 border-t border-neutral-800/50">
              <div className="space-y-1 pt-2">
                <label className="text-[9px] uppercase opacity-50">Animate (s)</label>
                <input
                  type="range"
                  min="0"
                  max={activeTab === 'show' ? showInterval : 30}
                  step="0.1"
                  value={animateDuration}
                  onChange={(e) => setAnimateDuration(Number(e.target.value))}
                  className="w-full accent-green-500 h-1"
                />
                <EditableValue
                  value={animateDuration}
                  onChange={setAnimateDuration}
                  suffix="s"
                  min={0}
                  max={activeTab === 'show' ? showInterval : 30}
                  step={0.1}
                />
              </div>
              {activeTab === 'show' && (
                <div className="space-y-1 pt-2">
                  <label className="text-[9px] uppercase opacity-50">Interval (s)</label>
                  <input type="range" min="2" max="30" value={showInterval} onChange={(e) => updateShowInterval(Number(e.target.value))} className="w-full accent-green-500 h-1" />
                  <EditableValue value={showInterval} onChange={updateShowInterval} suffix="s" min={2} max={30} />
                </div>
              )}
            </div>

            <div className="grid grid-cols-2 gap-4 pt-2 border-t border-neutral-800/50">
              <div className="space-y-1 pt-2">
                <label className="text-[9px] uppercase opacity-50">WAV Export (s)</label>
                <input
                  type="range"
                  min="1"
                  max="21600"
                  value={wavDuration}
                  onChange={(e) => {
                    let val = Number(e.target.value);
                    if (activeTab === 'show' && showInterval > 0) {
                      val = Math.round(val / showInterval) * showInterval;
                    }
                    setWavDuration(val || 1);
                  }}
                  className="w-full accent-green-500 h-1"
                />
                <div className="flex justify-between items-center">
                  <span className="text-[8px] text-green-900">
                    {wavDuration > 60 ? `${(wavDuration * 48000 * 4 / (1024 * 1024)).toFixed(0)} MB` : ''}
                  </span>
                  <EditableValue
                    value={wavDuration}
                    onChange={(v) => {
                      let val = v;
                      if (activeTab === 'show' && showInterval > 0) {
                        val = Math.round(val / showInterval) * showInterval;
                      }
                      setWavDuration(val || 1);
                    }}
                    suffix={wavDuration >= 3600 ? `h` : "s"}
                    min={1}
                    max={86400}
                  />
                </div>
              </div>
              <div className="space-y-1 pt-2">
                <label className="text-[9px] uppercase opacity-50">Master Gain</label>
                <input type="range" min="0" max="1" step="0.01" value={gain} onChange={(e) => setGain(Number(e.target.value))} className="w-full accent-green-500 h-1" />
                <EditableValue
                  value={Math.round(gain * 100)}
                  onChange={(v) => setGain(v / 100)}
                  suffix="%"
                  min={0}
                  max={100}
                />
              </div>
            </div>
          </section>

          {/* Export & Actions Section (Always Visible) */}
          <section className="bg-neutral-900/50 border border-neutral-800 rounded-xl p-4 flex justify-between items-center">
            <div>
              <h3 className="text-[10px] font-bold uppercase tracking-widest opacity-30">Export Output</h3>
              <p className="text-[10px] opacity-20">PCM 16-BIT 48KHZ</p>
            </div>
            <button
              onClick={downloadWav}
              disabled={activeTab === 'single' ? !singleSignal : playlist.length === 0}
              className="bg-green-950 text-green-500 border border-green-800 px-4 py-2 rounded text-[10px] font-bold hover:bg-green-800 hover:text-black transition-all disabled:opacity-20"
            >
              DOWNLOAD WAV
            </button>
          </section>
        </div>

        {/* Right Column: Emulated X-Y Display */}
        <div className="lg:col-span-8 flex flex-col gap-6">
          <div className="relative aspect-square bg-black border-[12px] border-neutral-900 rounded-[2.5rem] overflow-hidden shadow-[inset_0_0_100px_rgba(0,0,0,1),0_0_100px_rgba(0,255,0,0.03)] ring-1 ring-neutral-800">
            <canvas ref={canvasRef} width={1200} height={1200} className="w-full h-full grayscale-[0.2]" />

            {/* Reticle */}
            <div className="absolute inset-0 pointer-events-none grid grid-cols-10 grid-rows-10 opacity-5">
              {[...Array(100)].map((_, i) => <div key={i} className="border-[0.5px] border-green-500"></div>)}
            </div>

            <div className="absolute top-1/2 left-0 right-0 h-[0.5px] bg-green-500/10 pointer-events-none"></div>
            <div className="absolute left-1/2 top-0 bottom-0 w-[0.5px] bg-green-500/10 pointer-events-none"></div>

            {/* Dynamic Status Overlay */}
            <div className="absolute top-8 left-8 space-y-1">
              <div className="flex items-center gap-2">
                <div className={`w-1.5 h-1.5 rounded-full ${isPlaying ? 'bg-green-500 animate-pulse' : 'bg-neutral-800'}`}></div>
                <span className="text-[10px] font-black uppercase tracking-widest">{activeTab} TIMELINE</span>
              </div>
              <div className="text-[9px] opacity-40 font-mono tracking-tighter tabular-nums">
                {activeTab === 'single' ? (singleSignal?.name || 'IDLE_CH_NULL') :
                  (playlist[Math.floor(currentTime / showInterval) % playlist.length]?.name || 'PLAYLIST_EMPTY')}
              </div>
            </div>

            {!isPlaying && (
              <div className="absolute inset-0 flex items-center justify-center pointer-events-none bg-black/40 backdrop-blur-[1px]">
                <div className="text-center opacity-30 group">
                  <div className="text-9xl mb-4 leading-none select-none">∿</div>
                  <p className="uppercase tracking-[0.5em] text-[10px] font-black italic">Beam Parked</p>
                </div>
              </div>
            )}
          </div>

          {/* Timeline & Scrubber UI */}
          <section className="bg-neutral-900 border border-neutral-800 rounded-2xl p-6 space-y-4 shadow-xl">
            <div className="flex items-center gap-6">
              <button
                onClick={togglePlay}
                disabled={activeTab === 'single' ? !singleSignal : playlist.length === 0}
                className={`w-14 h-14 rounded-full flex items-center justify-center transition-all ${!isPlaying ? 'bg-green-600 text-black hover:scale-105' : 'bg-red-900/40 text-red-500 border border-red-900 hover:bg-red-600 hover:text-white'}`}
              >
                {isPlaying ? (
                  <svg width="24" height="24" viewBox="0 0 24 24" fill="currentColor"><rect x="6" y="4" width="4" height="16" /><rect x="14" y="4" width="4" height="16" /></svg>
                ) : (
                  <svg width="24" height="24" viewBox="0 0 24 24" fill="currentColor" className="ml-1"><path d="M8 5v14l11-7z" /></svg>
                )}
              </button>

              <div className="flex-1 space-y-2">
                <div className="flex justify-between items-end">
                  <span className="text-[10px] font-bold opacity-30 uppercase tracking-widest">Master Timeline</span>
                  <span className="text-xs font-bold tabular-nums">{formatTime(currentTime)} / {activeTab === 'show' ? formatTime(totalShowDuration) : '∞'}</span>
                </div>

                <div className="relative group">
                  {activeTab === 'show' && playlist.map((_, i) => (
                    <div
                      key={i}
                      className="absolute top-[-4px] bottom-[-4px] border-l border-neutral-800 pointer-events-none z-10"
                      style={{ left: `${(i / playlist.length) * 100}%` }}
                    ></div>
                  ))}
                  <input
                    type="range"
                    min="0"
                    max={activeTab === 'show' ? totalShowDuration || 1 : 3600}
                    step="0.01"
                    value={currentTime}
                    onChange={(e) => scrubTime(Number(e.target.value))}
                    className="w-full accent-green-500 h-3 rounded-lg overflow-hidden appearance-none bg-neutral-800 cursor-ew-resize"
                  />
                </div>
              </div>
            </div>

            {activeTab === 'show' && playlist.length > 0 && (
              <div className="flex gap-1">
                {playlist.map((p, i) => (
                  <div
                    key={p.id}
                    className={`h-1 flex-1 rounded-full transition-all duration-300 ${i === Math.floor(currentTime / showInterval) ? 'bg-green-500 glow-bar' : 'bg-neutral-800'}`}
                  ></div>
                ))}
              </div>
            )}
          </section>
        </div>
      </div>

      <style jsx global>{`
        @import url('https://fonts.googleapis.com/css2?family=Space+Mono:ital,wght@0,400;0,700;1,400;1,700&display=swap');
        
        body {
            font-family: 'Space Mono', monospace;
            cursor: crosshair;
        }

        .glow-text {
            text-shadow: 0 0 15px rgba(0, 255, 0, 0.4);
        }

        .glow-bar {
            box-shadow: 0 0 10px rgba(0, 255, 0, 0.5);
        }

        input[type="range"]::-webkit-slider-thumb {
            -webkit-appearance: none;
            width: 12px;
            height: 24px;
            background: #00ff00;
            border-radius: 4px;
            cursor: ew-resize;
            box-shadow: 0 0 10px rgba(0, 255, 0, 0.8);
        }

        ::-webkit-scrollbar {
            width: 4px;
        }
        ::-webkit-scrollbar-track {
            background: transparent;
        }
        ::-webkit-scrollbar-thumb {
            background: #1a1a1a;
            border-radius: 10px;
        }
        ::-webkit-scrollbar-thumb:hover {
            background: #2a2a2a;
        }

        input[type="number"]::-webkit-inner-spin-button,
        input[type="number"]::-webkit-outer-spin-button {
            -webkit-appearance: none;
            margin: 0;
        }
        input[type="number"] {
            -moz-appearance: textfield;
        }
      `}</style>
    </main>
  );
}

// Global string writer helper
function writeString(view: DataView, offset: number, string: string) {
  for (let i = 0; i < string.length; i++) {
    view.setUint8(offset + i, string.charCodeAt(i));
  }
}
