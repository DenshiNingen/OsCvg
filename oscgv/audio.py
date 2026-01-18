import numpy as np
import sounddevice as sd
from scipy.io.wavfile import write
import time
import os

def interpolate_path(path_points, target_length):
    """
    Interpolates a path (N, 2) to a target length (M, 2).
    """
    if target_length <= 0:
        return np.empty((0, 2))
    
    current_length = len(path_points)
    if current_length == 0:
        return np.zeros((target_length, 2))
    if current_length == 1:
        return np.tile(path_points, (target_length, 1))
        
    # Create input indices (0 to 1)
    input_indices = np.linspace(0, 1, current_length)
    # Create target indices
    target_indices = np.linspace(0, 1, target_length)
    
    # Interpolate X and Y separately
    x = np.interp(target_indices, input_indices, path_points[:, 0])
    y = np.interp(target_indices, input_indices, path_points[:, 1])
    
    return np.stack((x, y), axis=1)

def generate_signal(paths, sample_rate=48000, refresh_rate=60, transit_speed=20.0):
    """
    Generates a stereo audio signal from a list of paths, including transit lines to reduce ringing.
    
    Args:
        paths (list of np.ndarray): List of paths from the parser.
        sample_rate (int): Audio sample rate in Hz.
        refresh_rate (float): Refresh rate in Hz (times to draw image per second).
        transit_speed (float): Speed factor for transit moves relative to drawing speed.
        
    Returns:
        np.ndarray: Stereo audio signal (N, 2).
    """
    samples_per_frame = int(sample_rate / refresh_rate)
    
    # Calculate geometric lengths of paths
    path_lengths = []
    for path in paths:
        diffs = np.diff(path, axis=0)
        dist = np.sum(np.sqrt(np.sum(diffs**2, axis=1)))
        path_lengths.append(dist)
        
    # Calculate transit lengths (end of i to start of i+1, and loop back)
    transit_lengths = []
    num_paths = len(paths)
    if num_paths > 0:
        for i in range(num_paths):
            end_point = paths[i][-1]
            next_start_point = paths[(i + 1) % num_paths][0]
            dist = np.linalg.norm(next_start_point - end_point)
            transit_lengths.append(dist)
    else:
        return np.zeros((samples_per_frame, 2))
        
    total_path_length = sum(path_lengths)
    total_transit_length = sum(transit_lengths)
    
    # Heuristic: We want transits to be fast (dim) but not instant (ringing).
    # However, if we just allocate by length, a long jump will be very visible.
    # Strategy: 
    # 1. Allocate a minimum number of samples for any jump to band-limit it (e.g. 1% of frame or fixed count).
    # 2. Or just throw everything into the length bucket. 
    # If we treat transits as normal paths, they will be drawn at the same speed as the image -> VERY BRIGHT lines.
    # We want them FASTER. So we should weight their length less, or force them to be short duration.
    
    # Let's try forcing transits to be a fixed small portion of the time, 
    # e.g., allow them to take up much less time proportional to distance than drawing.
    # Actually, the "speed" of the beam determines brightness. Faster = Dimmer.
    # So we want transit velocity >> drawing velocity.
    
    # Let's say drawing velocity is V_draw. Transit velocity V_trans = k * V_draw (where k > 1).
    # Effective length for allocation = Real_Length / Speed_Factor.
    # We want transits to be, say, 10x faster (k=10).
    
    # Limit speed factor to avoid division by zero or negative
    if transit_speed <= 0:
         speed_factor = 20.0
    else:
         speed_factor = transit_speed
    
    effective_total_length = total_path_length + (total_transit_length / speed_factor)
    
    if effective_total_length == 0:
        return np.zeros((samples_per_frame, 2))
        
    signal_parts = []
    current_sample_count = 0
    
    for i in range(num_paths):
        # 1. Draw the path
        # allocation based on PROPORTION of effective length
        # path len is normal (factor 1)
        path_samples = int((path_lengths[i] / effective_total_length) * samples_per_frame)
        # Ensure at least 1 sample if length > 0
        if path_lengths[i] > 0 and path_samples < 2: 
            path_samples = 2
            
        if path_samples > 0:
            signal_parts.append(interpolate_path(paths[i], path_samples))
            current_sample_count += path_samples
            
        # 2. Draw the transit to next path
        transit_len = transit_lengths[i]
        if transit_len > 0:
            # Transit gets less time (higher speed)
            trans_samples = int(((transit_len / speed_factor) / effective_total_length) * samples_per_frame)
            
            # CRITICAL: Minimum samples to avoid ringing.
            # 5-10 samples at 48kHz is very short (0.1ms) but enough to smooth the step.
            if trans_samples < 8: 
                trans_samples = 8
            
            # Start of transit is end of current path
            # End of transit is start of next path
            start_pt = paths[i][-1]
            end_pt = paths[(i + 1) % num_paths][0]
            
            # Create a simple line
            transit_path = np.array([start_pt, end_pt])
            signal_parts.append(interpolate_path(transit_path, trans_samples))
            current_sample_count += trans_samples

    if not signal_parts:
        return np.zeros((samples_per_frame, 2))

    full_signal = np.concatenate(signal_parts)
    
    # Resample to match exact samples_per_frame if we drifted
    if len(full_signal) != samples_per_frame:
         full_signal = interpolate_path(full_signal, samples_per_frame)
         
    return full_signal.astype(np.float32)

def stream_audio(signal, sample_rate=48000):
    """
    Streams the audio signal in a loop.
    """
    print(f"Streaming audio at {sample_rate}Hz... Press Ctrl+C to stop.")
    
    stream = sd.OutputStream(samplerate=sample_rate, channels=2)
    stream.start()
    
    try:
        while True:
            # Write the whole frame repeatedly. 
            # This might block if the buffer is full, which acts as timing.
            stream.write(signal)
            
    except KeyboardInterrupt:
        print("\nStreaming stopped.")
    except Exception as e:
        print(f"Error streaming audio: {e}")
    finally:
        stream.stop()
        stream.close()

def stream_audio_live(file_path, sample_rate=48000, refresh_rate=60, transit_speed=20.0):
    """
    Streams audio and polls the file for changes.
    """
    from oscgv.parser import parse_svg
    
    print(f"Live Streaming {file_path} at {sample_rate}Hz...")
    print("Modify the SVG file to update the signal live. Press Ctrl+C to stop.")

    # Initial load
    try:
        paths = parse_svg(file_path)
        current_signal = generate_signal(paths, sample_rate, refresh_rate, transit_speed)
        last_mtime = os.path.getmtime(file_path)
    except Exception as e:
        print(f"Initial load failed: {e}")
        return

    # Use a simpler non-blocking stream approach with a callback or just careful loop
    # Ideally we'd use a callback to be glitch-free, but polling logic is easier in main loop.
    # Let's use a mutable container for the signal so the callback can read it.
    
    signal_container = [current_signal]
    
    def callback(outdata, frames, time, status):
        # We need to write 'frames' frames.
        # We cycle through signal_container[0]
        if status:
            print(status)
            
        sig = signal_container[0]
        sig_len = len(sig)
        
        # This simple cyclical reading is tricky with arbitrary buffer sizes without tracking phase.
        # But `outdata` is usually small.
        # To keep it simple, let's just use the `stream.write` blocking method in the main loop
        # and check for file changes occasionally.
        pass

    # Clean approach: Main loop writes chunks. Check file every X seconds.
    stream = sd.OutputStream(samplerate=sample_rate, channels=2)
    stream.start()
    
    last_check = time.time()
    check_interval = 0.5 # check every 500ms
    
    try:
        while True:
            # Write one frame (approx 1/60th sec)
            stream.write(signal_container[0])
            
            # Check for update
            now = time.time()
            if now - last_check > check_interval:
                last_check = now
                try:
                    if os.path.exists(file_path):
                        mtime = os.path.getmtime(file_path)
                        if mtime > last_mtime:
                            print(f"\nReloading {file_path}...")
                            new_paths = parse_svg(file_path)
                            new_signal = generate_signal(new_paths, sample_rate, refresh_rate, transit_speed)
                            
                            # Update signal atomic-ish
                            signal_container[0] = new_signal
                            last_mtime = mtime
                            print("Reloaded.")
                except Exception as e:
                    print(f"Error reloading: {e}")
                    # Keep playing old signal
                    
    except KeyboardInterrupt:
        print("\nLive streaming stopped.")
    finally:
        stream.stop()
        stream.close()

def save_wav(signal, filename, sample_rate=48000, duration=5.0):
    """
    Saves the signal to a WAV file.
    
    Args:
        signal (np.ndarray): Audio signal (one frame/cycle).
        filename (str): Output filename.
        sample_rate (int): Sample rate.
        duration (float): Duration in seconds.
    """
    if duration <= 0:
        raise ValueError("Duration must be positive")
        
    num_repeats = int(duration * sample_rate / len(signal)) + 1
    long_signal = np.tile(signal, (num_repeats, 1))
    
    # Crop to exact duration
    long_signal = long_signal[:int(duration * sample_rate)]
    
    write(filename, sample_rate, long_signal)
    print(f"Saved {duration}s of audio to {filename}")

def slice_paths(paths, fraction):
    """
    Returns a subset of paths representing the first 'fraction' (0.0 to 1.0) of the total length.
    """
    if fraction <= 0:
        return []
    if fraction >= 1.0:
        return paths
        
    # Calculate total length
    path_lengths = []
    total_length = 0
    for path in paths:
        diffs = np.diff(path, axis=0)
        dist = np.sum(np.sqrt(np.sum(diffs**2, axis=1)))
        path_lengths.append(dist)
        total_length += dist
        
    target_length = total_length * fraction
    
    current_length = 0
    sliced_paths = []
    
    for i, path in enumerate(paths):
        p_len = path_lengths[i]
        if current_length + p_len <= target_length:
            # Full path included
            sliced_paths.append(path)
            current_length += p_len
        else:
            # Partial path needed
            remaining = target_length - current_length
            if remaining > 0 and p_len > 0:
                # Approximate index
                # We assume uniform distribution of points approx?
                # path is array of points. Length is sum of segments.
                # Simple approximation: index proportional to length fraction
                idx = int((remaining / p_len) * len(path))
                if idx > 1:
                    sliced_paths.append(path[:idx])
            break
            
    return sliced_paths

def generate_animation(paths, duration, sample_rate=48000, refresh_rate=60, transit_speed=20.0):
    """
    Generates an animation signal that progressively reveals the paths.
    
    Args:
        paths: List of paths.
        duration: functionality duration in seconds.
    """
    num_frames = int(duration * refresh_rate)
    samples_per_frame = int(sample_rate / refresh_rate)
    
    full_signal = []
    
    for i in range(num_frames):
        progress = (i + 1) / num_frames
        # Non-linear progress for better effect? (Ease-out)
        # progress = np.sin(progress * np.pi / 2) 
        
        visible_paths = slice_paths(paths, progress)
        
        if not visible_paths:
            # Silence/Center for this frame
            frame_sig = np.zeros((samples_per_frame, 2))
        else:
            # Generate one frame
            # scale transit speed? maybe keep it constant?
            frame_sig = generate_signal(visible_paths, sample_rate, refresh_rate, transit_speed)
            
        full_signal.append(frame_sig)
        
    if not full_signal:
        return np.zeros((0, 2))
        
    return np.concatenate(full_signal).astype(np.float32)

def generate_show(signals, interval, total_duration, sample_rate=48000, animations=None):
    """
    Generates a full show signal by cycling through the provided signals.
    
    Args:
        signals (list of np.ndarray): List of static loop signals.
        interval (float): Duration of each slide (animation + static) in seconds.
        total_duration (float): Total length of the show in seconds.
        sample_rate (int): Sample rate.
        animations (list of np.ndarray): Optional list of animation signals corresponding to signals.
        
    Returns:
        np.ndarray: The complete audio signal.
    """
    if not signals:
         raise ValueError("No signals provided for show.")
         
    total_samples = int(total_duration * sample_rate)
    samples_per_interval = int(interval * sample_rate)
    
    # Pre-allocate output buffer
    show_signal = np.zeros((total_samples, 2), dtype=np.float32)
    
    current_sample = 0
    signal_idx = 0
    
    while current_sample < total_samples:
        # Determine which signal to play
        idx = signal_idx % len(signals)
        sig = signals[idx]
        anim = animations[idx] if animations and animations[idx] is not None else None
        
        # How many samples available in the buffer?
        remaining_buffer = total_samples - current_sample
        
        # How many samples for this interval?
        # If we are near the end, we just fill what's left.
        # But logically, a slide has a fixed slot.
        write_len = min(samples_per_interval, remaining_buffer)
        
        if write_len <= 0:
            break
            
        written_in_interval = 0
        
        # 1. Write Animation (if exists)
        if anim is not None and len(anim) > 0:
             # How much can we write?
             to_write = min(len(anim), write_len)
             show_signal[current_sample : current_sample + to_write] = anim[:to_write]
             
             current_sample += to_write
             written_in_interval += to_write
             write_len -= to_write
             
        # 2. Write Static Loop
        if write_len > 0:
            if len(sig) == 0:
                # Silence
                current_sample += write_len
            else:
                # Tile signal to fill remaining slot
                repeats = int(np.ceil(write_len / len(sig)))
                chunk = np.tile(sig, (repeats, 1))
                chunk = chunk[:write_len]
                
                show_signal[current_sample : current_sample + write_len] = chunk
                current_sample += write_len
            
        signal_idx += 1
        
    return show_signal

def stream_show_live(directory, interval=10.0, sample_rate=48000, refresh_rate=60, transit_speed=20.0, animate_duration=0.0):
    """
    Streams audio from a directory of SVGs, looping continuously and reloading files.
    """
    import glob
    from oscgv.parser import parse_svg
    
    print(f"Live Show Mode: {directory}")
    print(f"Interval: {interval}s")
    print("Press Ctrl+C to stop.")
    
    stream = sd.OutputStream(samplerate=sample_rate, channels=2)
    stream.start()
    
    # Cache: path -> {'mtime': float, 'signal': np.ndarray}
    signal_cache = {}
    
    try:
        while True:
            svg_files = sorted(glob.glob(os.path.join(directory, "*.svg")))
            if not svg_files:
                print("No SVGs found. Waiting...")
                time.sleep(1)
                continue
                
            for f in svg_files:
                # Re-check if file exists
                if not os.path.exists(f): 
                    continue
                    
                print(f"Now Playing: {os.path.basename(f)}")
                
                try:
                    current_mtime = os.path.getmtime(f)
                    
                    # Check cache for STATIC signal
                    if f in signal_cache and signal_cache[f]['mtime'] == current_mtime:
                        static_signal = signal_cache[f]['signal']
                        # Reset start time if we just switched to this file?
                        # This loop runs continuously for a file.
                        # We need to distinguish "First play of this interval" vs "Looping".
                        # Actually the outer loop iterates files.
                        # The inner loop plays for 'interval'.
                        pass 
                    else:
                        if f in signal_cache:
                             print(f" (Reloading changed file...)")
                        # Parse and generate
                        paths = parse_svg(f)
                        static_signal = generate_signal(paths, sample_rate, refresh_rate, transit_speed)
                        signal_cache[f] = {'mtime': current_mtime, 'signal': static_signal}
                        
                except Exception as e:
                    print(f"Error loading {f}: {e}")
                    time.sleep(1)
                    continue
                
                # Setup playback for this interval
                start_time = time.time()
                
                # Animation phase
                if animate_duration > 0:
                    try:
                        # Don't cache animation for now (expensive memory?) or maybe we should?
                        # Generating animation takes time (lots of frames).
                        # Let's generate it on the fly only if needed.
                        # For smoothness, pre-calculating is better.
                        # Let's add it to cache.
                        if 'animation' not in signal_cache[f]:
                             # Need paths again... cache paths?
                             # Or just re-parse?
                             p = parse_svg(f)
                             anim_sig = generate_animation(p, animate_duration, sample_rate, refresh_rate, transit_speed)
                             signal_cache[f]['animation'] = anim_sig
                        
                        anim_signal = signal_cache[f]['animation']
                        
                        # Write animation once
                        stream.write(anim_signal)
                        
                        # Adjust start time so the interval counts the animation?
                        # User said "doing a little animation ... BEFORE having it still".
                        # Usually implies Interval = Animation + Static.
                        
                        # If interval is 10s, animation is 2s.
                        # We played 2s. Remaining time = 8s.
                        # But 'stream.write' blocks. So 'time.time()' will Advance.
                        
                    except Exception as e:
                        print(f"Animation error: {e}")

                # Static phase
                while time.time() - start_time < interval:
                     stream.write(static_signal)
                     
    except KeyboardInterrupt:
        print("\nLive show stopped.")
    finally:
        stream.stop()
        stream.close()
