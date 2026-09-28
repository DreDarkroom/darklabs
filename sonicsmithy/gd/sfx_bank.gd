# sfx_bank.gd — Sonic Smithy SFX player for Godot 4.x
#
# Setup:
#   1. Copy the exported folder (e.g. res://audio/sfx/) into your project.
#   2. Project > Project Settings > Autoload: add this script as "SfxBank".
#   3. Make an audio bus called "SFX" (or change `bus` in sfx_manifest.json).
#
# Use:
#   SfxBank.play("pistol_sidearm")                       # random variant, random pitch/volume
#   SfxBank.play_at("impact_heavy", $Enemy.global_position)   # 3D (Node3D) — mono sounds pan correctly
#   var p := SfxBank.loop("rail_grind_med")              # looping AudioStreamPlayer; returns it so you can drive it
#   SfxBank.set_grind_speed(p, 0.7)                      # pitch-scales a rail loop from 0..1 speed
#   SfxBank.stop_loop(p)
extends Node

const MANIFEST := "res://audio/sfx/sfx_manifest.json"   # change if you put the folder elsewhere
const POOL_SIZE := 24

var _sounds: Dictionary = {}
var _bus := "SFX"
var _root := "res://audio/sfx/"
var _cache: Dictionary = {}
var _pool: Array[AudioStreamPlayer] = []
var _active: Dictionary = {}          # sound name -> Array[AudioStreamPlayer] currently playing (polyphony limit)
var _last_variant: Dictionary = {}    # avoid playing the same variant twice in a row

func _ready() -> void:
	_root = MANIFEST.get_base_dir() + "/"
	var f := FileAccess.open(MANIFEST, FileAccess.READ)
	if f == null:
		push_warning("SfxBank: manifest not found at %s" % MANIFEST)
		return
	var data = JSON.parse_string(f.get_as_text())
	if typeof(data) == TYPE_DICTIONARY:
		_bus = data.get("bus", "SFX")
		_sounds = data.get("sounds", {})
	for i in POOL_SIZE:
		var p := AudioStreamPlayer.new()
		p.bus = _bus
		add_child(p)
		_pool.append(p)

func has_sound(name: String) -> bool:
	return _sounds.has(name)

func play(name: String, volume_db := 0.0, pitch := 1.0) -> AudioStreamPlayer:
	var s = _prep(name)
	if s == null:
		return null
	var p := _free_player()
	if p == null:
		return null
	p.stream = s.stream
	p.volume_db = volume_db + s.def.get("volume_db", 0.0) + randf_range(-1.0, 1.0) * s.def.get("volume_var_db", 0.0)
	p.pitch_scale = pitch * (1.0 + randf_range(-1.0, 1.0) * s.def.get("pitch_var", 0.0))
	p.play()
	_track(name, p, s.def)
	return p

func play_at(name: String, pos: Vector3, volume_db := 0.0, pitch := 1.0) -> AudioStreamPlayer3D:
	var s = _prep(name)
	if s == null:
		return null
	var p := AudioStreamPlayer3D.new()
	p.bus = _bus
	p.stream = s.stream
	p.volume_db = volume_db + s.def.get("volume_db", 0.0) + randf_range(-1.0, 1.0) * s.def.get("volume_var_db", 0.0)
	p.pitch_scale = pitch * (1.0 + randf_range(-1.0, 1.0) * s.def.get("pitch_var", 0.0))
	add_child(p)
	p.global_position = pos
	p.finished.connect(p.queue_free)
	p.play()
	return p

# Looping sounds (rail grind, engines...). Loop points come from the file (WAV smpl chunk)
# or the manifest (OGG) — either way we set them explicitly so behaviour is identical.
func loop(name: String, volume_db := 0.0) -> AudioStreamPlayer:
	var s = _prep(name)
	if s == null:
		return null
	var p := AudioStreamPlayer.new()
	p.bus = _bus
	p.stream = s.stream
	p.volume_db = volume_db
	add_child(p)
	p.play()
	return p

func stop_loop(p: AudioStreamPlayer, fade := 0.08) -> void:
	if p == null:
		return
	var t := create_tween()
	t.tween_property(p, "volume_db", -60.0, fade)
	t.tween_callback(p.queue_free)

# speed 0..1 -> pitch 0.85..1.2 and a little level (rail grinding, wheels, wind)
func set_grind_speed(p: AudioStreamPlayer, speed: float) -> void:
	if p == null:
		return
	p.pitch_scale = lerpf(0.85, 1.2, clampf(speed, 0.0, 1.0))
	p.volume_db = lerpf(-9.0, -3.0, clampf(speed, 0.0, 1.0))

# ---- internals
func _prep(name: String):
	if not _sounds.has(name):
		push_warning("SfxBank: unknown sound '%s'" % name)
		return null
	var def: Dictionary = _sounds[name]
	var files: Array = def.get("files", [])
	if files.is_empty():
		return null
	var idx := randi() % files.size()
	if files.size() > 1 and idx == _last_variant.get(name, -1):
		idx = (idx + 1) % files.size()
	_last_variant[name] = idx
	var path: String = _root + files[idx]
	var stream: AudioStream = _cache.get(path)
	if stream == null:
		stream = load(path)
		if stream == null:
			return null
		if def.get("loop", false):
			_apply_loop(stream, def)
		_cache[path] = stream
	return {"stream": stream, "def": def}

func _apply_loop(stream: AudioStream, def: Dictionary) -> void:
	var ls: float = def.get("loop_start", 0.0)
	var le: float = def.get("loop_end", 0.0)
	if stream is AudioStreamOggVorbis:
		stream.loop = true
		stream.loop_offset = ls
	elif stream is AudioStreamMP3:
		stream.loop = true
		stream.loop_offset = ls
	elif stream is AudioStreamWAV:
		stream.loop_mode = AudioStreamWAV.LOOP_FORWARD
		var rate := float(stream.mix_rate)
		stream.loop_begin = int(ls * rate)
		stream.loop_end = int(le * rate) if le > 0.0 else stream.get_length() * rate

func _free_player() -> AudioStreamPlayer:
	for p in _pool:
		if not p.playing:
			return p
	return null   # pool exhausted: drop the sound rather than cut a playing one

func _track(name: String, p: AudioStreamPlayer, def: Dictionary) -> void:
	var list: Array = _active.get(name, [])
	list = list.filter(func(x): return is_instance_valid(x) and x.playing)
	list.append(p)
	var limit: int = def.get("max_polyphony", 4)
	while list.size() > limit:
		var oldest: AudioStreamPlayer = list.pop_front()
		if is_instance_valid(oldest):
			oldest.stop()
	_active[name] = list
