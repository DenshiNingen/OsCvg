# OsCvg - Oscilloscope SVG

**OsCvg** is a Python tool that converts SVG images into stereo audio signals for display on an oscilloscope in X-Y mode. It supports live hot-reloading, playlist orchestration ("Show Mode"), and entry animations.

## Features

- **Convert SVG to Audio**: Turns paths into X/Y audio signals.
- **Oscilloscope Visualization**: Optimized for X-Y mode displays.
- **Live Mode**: Hot-reload audio when SVG files are saved (`--live`).
- **Show Mode**: Create playlists from a directory of SVGs (`--interval`, `--duration`).
- **Entry Animations**: Progressive "drawing" of the SVG paths (`--animate`).
- **Transit Control**: Adjust transit line brightness/speed (`--transit-speed`).
- **WAV Output**: Save generated signals to WAV files.

## Installation

1. Clone the repository.
2. Install dependencies:
   ```bash
   pip install -r requirements.txt
   ```
   (Requires `numpy`, `scipy`, `svgpathtools`, `sounddevice`)

## Usage

### Live Preview
Play a single SVG on your audio output:
```bash
python main.py logo.svg --play
```

### Live Editing
Watch the file and update audio on save:
```bash
python main.py logo.svg --live
```

### Show Mode
Play all SVGs in a folder, switching every 10 seconds:
```bash
python main.py my_show/ --live --interval 10
```

Add an entry animation (2 seconds drawing, 8 seconds static):
```bash
python main.py my_show/ --live --interval 10 --animate 2
```

### Export to WAV
Generate a 60-minute show file:
```bash
python main.py my_show/ --interval 10 --animate 2 --duration 3600 --output show_60min.wav
```

## Configuration

- `--sample-rate`: Audio sample rate (default 48000).
- `--transit-speed`: Speed of transit lines (default 20.0). Higher = faster/dimmer.
- `--refresh-rate`: Oscilloscope refresh rate (default 60Hz).

## License

MIT
