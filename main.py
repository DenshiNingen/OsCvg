#!/usr/bin/env python3
import argparse
import os
import sys
import glob
from oscgv.parser import parse_svg
from scipy.io.wavfile import write
from oscgv.audio import generate_signal, stream_audio, save_wav, stream_audio_live, generate_show, stream_show_live, generate_animation

def main():
    parser = argparse.ArgumentParser(description="Convert SVG to Oscilloscope Audio (XY)")
    parser.add_argument("input_file", help="Path to input SVG file")
    parser.add_argument("--refresh-rate", type=float, default=60.0, help="Refresh rate in Hz (default: 60)")
    parser.add_argument("--sample-rate", type=int, default=48000, help="Sample rate in Hz (default: 48000)")
    parser.add_argument("--transit-speed", type=float, default=20.0, help="Speed of transit moves relative to drawing (default: 20.0)")
    parser.add_argument("--duration", type=float, default=5.0, help="Duration of the output file in seconds (default: 5.0)")
    parser.add_argument("--interval", type=float, default=10.0, help="Interval between images in show mode (default: 10s)")
    parser.add_argument("--animate", type=float, default=0.0, help="Duration of entry animation in seconds (default: 0.0)")
    parser.add_argument("--play", action="store_true", help="Play audio to default output device")
    parser.add_argument("--live", action="store_true", help="Live mode: watch input file and update real-time")
    parser.add_argument("--output", help="Output WAV file path")
    parser.add_argument("--preview", action="store_true", help="Show a plot of the generated signal (requires matplotlib)")

    args = parser.parse_args()

    if not os.path.exists(args.input_file):
        print(f"Error: File not found: {args.input_file}")
        sys.exit(1)

    # Check if input is directory for show mode
    if os.path.isdir(args.input_file):
        print(f"Directory detected: {args.input_file} (Show Mode)")
        
        if args.live:
            stream_show_live(args.input_file, interval=args.interval, sample_rate=args.sample_rate, refresh_rate=args.refresh_rate, transit_speed=args.transit_speed, animate_duration=args.animate)
            return
            
        svg_files = sorted(glob.glob(os.path.join(args.input_file, "*.svg")))
        
        if not svg_files:
            print("No SVG files found in directory.")
            sys.exit(1)
            
        print(f"Found {len(svg_files)} SVGs.")
        signals = []
        animations = []
        for f in svg_files:
            try:
                p = parse_svg(f)
                # Generate base signal (1 cycle)
                s = generate_signal(p, sample_rate=args.sample_rate, refresh_rate=args.refresh_rate, transit_speed=args.transit_speed)
                signals.append(s)
                
                if args.animate > 0:
                    a = generate_animation(p, args.animate, sample_rate=args.sample_rate, refresh_rate=args.refresh_rate, transit_speed=args.transit_speed)
                    animations.append(a)
                else:
                    animations.append(None)
                    
                print(f"Loaded {os.path.basename(f)}")
            except Exception as e:
                print(f"Skipping {f}: {e}")
        
        if not signals:
            print("No valid signals generated.")
            sys.exit(1)
            
        print(f"Generating show ({args.duration}s total, {args.interval}s interval, {args.animate}s animation)...")
        signal = generate_show(signals, interval=args.interval, total_duration=args.duration, sample_rate=args.sample_rate, animations=animations)
        
    else:
        # File mode
        # Live mode handles its own parsing loop
        if args.live:
            stream_audio_live(args.input_file, sample_rate=args.sample_rate, refresh_rate=args.refresh_rate, transit_speed=args.transit_speed)
            return

        print(f"Parsing {args.input_file}...")
        try:
            paths = parse_svg(args.input_file)
        except Exception as e:
            print(f"Error parsing SVG: {e}")
            sys.exit(1)

        print(f"Generating signal ({len(paths)} paths)...")
        signal = generate_signal(paths, sample_rate=args.sample_rate, refresh_rate=args.refresh_rate, transit_speed=args.transit_speed)
    
    if args.preview:
        try:
            import matplotlib.pyplot as plt
            plt.figure(figsize=(6, 6))
            # Plot X vs Y
            plt.plot(signal[:, 0], signal[:, 1], lw=0.5)
            # Set limits just outside [-1, 1]
            plt.xlim(-1.1, 1.1)
            plt.ylim(-1.1, 1.1)
            plt.title("Expected Oscilloscope Display")
            plt.gca().set_aspect('equal')
            plt.show()
        except ImportError:
            print("Warning: Matplotlib not found. Skipping preview.")

    if args.output:
        # If show mode (input is dir), signal is already full duration.
        # If file mode, signal is one cycle, so we need to stretch it.
        # save_wav implementation repeats signal if needed.
        
        # WE NEED TO DISTINGUISH: Is 'signal' the full show or just a cycle?
        # If dir, it is full show.
        # If file, it is cycle.
        
        if os.path.isdir(args.input_file):
             # Save directly, do not repeat
             write(args.output, args.sample_rate, signal)
             print(f"Saved show to {args.output}")
        else:
             save_wav(signal, args.output, sample_rate=args.sample_rate, duration=args.duration)

    if args.play:
        stream_audio(signal, sample_rate=args.sample_rate)
    elif not args.output and not args.preview and not args.live and not os.path.isdir(args.input_file):
        print("No action specified. Use --play, --output, --preview, or --live.")

if __name__ == "__main__":
    main()
