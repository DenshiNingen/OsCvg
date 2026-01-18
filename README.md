# OsCvg: SVG to Oscilloscope Studio

**OsCvg** is an ecosystem for converting SVG images into stereo audio signals for display on an oscilloscope in X-Y mode. It features a high-performance Python engine and a modern web-based Studio for live performance and complex show arrangement.

## 🟢 OsCvg Studio (Web)
OsCvg Studio is a professional web interface for real-time oscilloscope art management. 

- **Timeline & Scrubber**: Navigate your show with a master timeline. Pause, play, and jump to any frame.
- **Drag-and-Drop Showroom**: Arrange your show sequence by dragging assets in the playlist.
- **Synchronized Animations**: Real-time entry animations (draw-in effects) synced with audio output.
- **Dynamic Gain & Scale**: Master gain directly controls the visual trace size (physical realism).
- **Pro WAV Exports**: Generate long-form WAV files (up to 24h) with automatic segment snapping.

### 🚀 Cloud Deployment
OsCvg Studio is optimized for **Vercel**.
1. Import the repo to Vercel.
2. Set the **Root Directory** to `web`.
3. Select the **Next.js** framework preset.
4. **Deploy!** Vercel handles the Next.js frontend and the Python serverless API automatically.

### 🛠 Local Studio Setup
```bash
# Start the Python API Server (from /web)
python dev_server.py

# Start the Web Studio (from /web)
npm install
npm run dev
```

---

## 🔵 OsCvg CLI (Python Core)
The core engine can also be used via terminal for automation and high-speed local processing.

### Installation
```bash
pip install -r web/requirements.txt
```
*(Requires `numpy`, `scipy`, `svgpathtools`, `sounddevice`)*

### Usage
- **Live Preview**: `python main.py logo.svg --play`
- **Live Editing**: `python main.py logo.svg --live` (Auto-reloads audio on SVG save)
- **Show Mode**: `python main.py show_folder/ --live --interval 10`
- **WAV Export**: `python main.py show_folder/ --duration 3600 --output set.wav`

---

## Technical Details
- **Signal**: 24-bit/16-bit PCM @ 48kHz (X = Left, Y = Right).
- **Transit Control**: Adjustable `--transit-speed` to minimize beam return ringing.
- **Architecture**: Next.js 15+ Frontend with a Python 3.11+ Serverless API backend.

sonora!
