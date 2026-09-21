import argparse
import os
import sys
import numpy as np
import librosa
import soundfile as sf
import av

def analyze_audio(input_path, output_dir):
    print(f"Loading {input_path}...")
    try:
        container = av.open(input_path)
        stream = container.streams.audio[0]
        frames = []
        for frame in container.decode(stream):
            frames.append(frame.to_ndarray())
        # Concatenate frames and take the first channel if stereo
        audio_data = np.concatenate(frames, axis=1)
        if audio_data.shape[0] > 1:
            audio_data = np.mean(audio_data, axis=0) # Mix down to mono
        else:
            audio_data = audio_data[0]
        
        orig_sr = stream.rate
        # Resample to 44100 using librosa
        if orig_sr != 44100:
            print(f"Resampling from {orig_sr} to 44100...")
            y = librosa.resample(audio_data.astype(np.float32), orig_sr=orig_sr, target_sr=44100)
        else:
            y = audio_data.astype(np.float32)
        sr = 44100
        
        # Normalize to float32 range [-1, 1] if needed (av gives int16/int32/float32)
        if y.dtype != np.float32:
            y = y.astype(np.float32)
        if np.max(np.abs(y)) > 1.5:
            y = y / np.max(np.abs(y))
            
    except Exception as e:
        print(f"Error loading audio: {e}")
        sys.exit(1)

    print(f"Loaded {len(y)} samples at {sr}Hz.")

    # 1. Find the hum (sustained tonal region)
    # We can compute zero-crossing rate and RMS energy to find a sustained low-frequency hum.
    # Alternatively, just use librosa's pitch tracker or harmonic/percussive separation.
    # Let's do a simple heuristic: find the longest continuous segment with high RMS and low ZCR.
    rms = librosa.feature.rms(y=y)[0]
    zcr = librosa.feature.zero_crossing_rate(y=y)[0]
    
    # We'll just extract a 1.5 second clip from the loudest part of the harmonic component.
    y_harmonic, y_percussive = librosa.effects.hpss(y)
    
    # Find the peak of the harmonic component and take window around it
    hum_peak_idx = np.argmax(np.abs(y_harmonic))
    hum_start = max(0, hum_peak_idx - int(sr * 0.5))
    hum_end = min(len(y), hum_peak_idx + int(sr * 1.0))
    hum_y = y[hum_start:hum_end]

    # 2. Find taps (onsets)
    # We'll run onset detection on the percussive component
    onset_frames = librosa.onset.onset_detect(y=y_percussive, sr=sr, wait=int(sr * 0.05 / 512)) # 50ms wait
    onset_samples = librosa.frames_to_samples(onset_frames)
    
    # Classify onsets
    # A single onset is soft or hard based on amplitude.
    # A double tap is two onsets within 0.15s.
    # A rapid run is 3+ onsets within 0.3s.

    # Compute onset amplitudes
    amplitudes = []
    for idx in onset_samples:
        window_end = min(len(y), idx + int(sr * 0.05)) # 50ms window
        amp = np.max(np.abs(y_percussive[idx:window_end]))
        amplitudes.append(amp)
    
    if not amplitudes:
        print("No onsets found!")
        sys.exit(1)

    med_amp = np.median(amplitudes)
    
    events = []
    # Group onsets that are close to each other
    i = 0
    while i < len(onset_samples):
        group = [onset_samples[i]]
        j = i + 1
        while j < len(onset_samples) and (onset_samples[j] - onset_samples[j-1]) < int(sr * 0.15):
            group.append(onset_samples[j])
            j += 1
        
        events.append({
            'start_sample': group[0],
            'onsets': group,
            'max_amp': max([amplitudes[k] for k in range(i, j)])
        })
        i = j

    # Classify events
    soft_single = []
    hard_single = []
    double = []
    rapid = []

    for ev in events:
        n_onsets = len(ev['onsets'])
        if n_onsets == 1:
            if ev['max_amp'] > med_amp:
                hard_single.append(ev)
            else:
                soft_single.append(ev)
        elif n_onsets == 2:
            double.append(ev)
        else:
            rapid.append(ev)
            
    def get_event_audio(event_list, duration=0.25):
        if not event_list:
            return None, 0, 0
        
        # Sort by amplitude to get a good representative
        event_list.sort(key=lambda x: x['max_amp'], reverse=True)
        ev = event_list[0]
        
        start_idx = max(0, ev['start_sample'] - int(sr * 0.02)) # 20ms pre-roll
        
        # For multiple onsets, ensure we capture the whole group plus some tail
        if len(ev['onsets']) > 1:
            end_onset = ev['onsets'][-1]
            end_idx = min(len(y), end_onset + int(sr * duration))
        else:
            end_idx = min(len(y), start_idx + int(sr * duration))
            
        segment = y[start_idx:end_idx]
        return segment, start_idx, end_idx

    # Get one of each
    soft_y, soft_start, soft_end = get_event_audio(soft_single, 0.15)
    hard_y, hard_start, hard_end = get_event_audio(hard_single, 0.2)
    double_y, double_start, double_end = get_event_audio(double, 0.3)
    rapid_y, rapid_start, rapid_end = get_event_audio(rapid, 0.4)

    # Fallbacks if some categories are empty
    if soft_y is None and hard_y is not None: soft_y = hard_y * 0.5
    if hard_y is None and soft_y is not None: hard_y = soft_y * 2.0
    if double_y is None and hard_y is not None: double_y = np.concatenate([hard_y, hard_y])
    if rapid_y is None and hard_y is not None: rapid_y = np.concatenate([hard_y, hard_y, hard_y])

    # Normalize helper
    def normalize(audio):
        if audio is None or len(audio) == 0:
            return audio
        peak = np.max(np.abs(audio))
        if peak > 0:
            return audio / peak * 0.9 # Normalize to -1dBish
        return audio

    outputs = {
        'tap-single-soft.wav': normalize(soft_y),
        'tap-single-hard.wav': normalize(hard_y),
        'tap-double.wav': normalize(double_y),
        'tap-rapid.wav': normalize(rapid_y),
        'tonal-hum.wav': normalize(hum_y)
    }

    print("\n--- EXTRACTION SUMMARY ---")
    print("WARNING: This is automated best-effort classification.")
    print("These selections MUST be manually auditioned before being considered final.\n")
    
    os.makedirs(output_dir, exist_ok=True)
    
    for filename, audio_data in outputs.items():
        if audio_data is not None and len(audio_data) > 0:
            filepath = os.path.join(output_dir, filename)
            sf.write(filepath, audio_data, sr)
            
            duration = len(audio_data) / sr
            peak = np.max(np.abs(audio_data))
            
            print(f"Exported: {filename}")
            print(f"  Duration: {duration:.3f}s")
            print(f"  Peak level: {peak:.3f}")
        else:
            print(f"Failed to extract audio for {filename}")
            
    print("\nExtraction complete.")

if __name__ == "__main__":
    parser = argparse.ArgumentParser(description="Extract tap and hum samples from an audio recording.")
    parser.add_argument("input", help="Path to the source audio file (e.g. .m4a)")
    parser.add_argument("--output", default="throattapper/assets/audio", help="Output directory")
    args = parser.parse_args()
    
    analyze_audio(args.input, args.output)
