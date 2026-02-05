import * as React from "react"
import {
  DownloadIcon,
  FileIcon,
  LoaderCircleIcon,
  SparklesIcon,
  UploadCloudIcon,
} from "lucide-react"

import { cn } from "@/lib/utils"

type QualityPreset = {
  id: "high" | "balanced" | "small"
  label: string
  bitrateScale: number
  hint: string
}

type SpeedPreset = {
  id: "fast" | "standard" | "quality"
  label: string
  latencyMode: "realtime" | "quality"
  gopSeconds: number
  hint: string
}

const qualityPresets: QualityPreset[] = [
  { id: "high", label: "High", bitrateScale: 1.35, hint: "More detail, larger file" },
  { id: "balanced", label: "Balanced", bitrateScale: 1, hint: "Best for most clips" },
  { id: "small", label: "Small", bitrateScale: 0.7, hint: "Smaller file, softer look" },
]

const speedPresets: SpeedPreset[] = [
  {
    id: "fast",
    label: "Faster",
    latencyMode: "realtime",
    gopSeconds: 1.5,
    hint: "Lower latency, larger file",
  },
  {
    id: "standard",
    label: "Standard",
    latencyMode: "realtime",
    gopSeconds: 2.5,
    hint: "Good balance",
  },
  {
    id: "quality",
    label: "Sharper",
    latencyMode: "quality",
    gopSeconds: 4,
    hint: "Better compression, slower",
  },
]

const formatBytes = (bytes: number) => {
  if (!Number.isFinite(bytes) || bytes <= 0) return "0 B"
  const units = ["B", "KB", "MB", "GB"]
  const exponent = Math.min(Math.floor(Math.log(bytes) / Math.log(1024)), units.length - 1)
  const value = bytes / 1024 ** exponent
  return `${value.toFixed(value >= 10 || exponent === 0 ? 0 : 1)} ${units[exponent]}`
}

const formatDuration = (seconds: number | null) => {
  if (!seconds || !Number.isFinite(seconds)) return "–"
  const minutes = Math.floor(seconds / 60)
  const remainder = Math.floor(seconds % 60)
  return `${minutes}:${remainder.toString().padStart(2, "0")}`
}

const supportsCaptureStream = () => {
  if (typeof document === "undefined") return false
  const video = document.createElement("video") as HTMLVideoElement & {
    captureStream?: () => MediaStream
    webkitCaptureStream?: () => MediaStream
  }
  return typeof video.captureStream === "function" || typeof video.webkitCaptureStream === "function"
}

const supportsVideoCodecs = () =>
  typeof window !== "undefined" &&
  "VideoEncoder" in window &&
  "MediaStreamTrackProcessor" in window &&
  supportsCaptureStream()

const supportsAudioCodecs = () =>
  typeof window !== "undefined" &&
  "AudioEncoder" in window &&
  "MediaStreamTrackProcessor" in window

const evenDimension = (value: number) => Math.max(2, Math.floor(value / 2) * 2)

const waitForBreathingRoom = () =>
  new Promise<void>((resolve) => {
    window.setTimeout(() => resolve(), 0)
  })

export function WebmConverter() {
  const [inputFile, setInputFile] = React.useState<File | null>(null)
  const [inputUrl, setInputUrl] = React.useState<string | null>(null)
  const [outputUrl, setOutputUrl] = React.useState<string | null>(null)
  const [outputSize, setOutputSize] = React.useState<number | null>(null)
  const [duration, setDuration] = React.useState<number | null>(null)
  const [isDragging, setIsDragging] = React.useState(false)
  const [isConverting, setIsConverting] = React.useState(false)
  const [progress, setProgress] = React.useState<number | null>(null)
  const [status, setStatus] = React.useState("Ready")
  const [error, setError] = React.useState<string | null>(null)
  const [quality, setQuality] = React.useState<QualityPreset>(qualityPresets[1])
  const [speed, setSpeed] = React.useState<SpeedPreset>(speedPresets[1])
  const [includeAudio, setIncludeAudio] = React.useState(true)
  const [isSupported, setIsSupported] = React.useState(true)

  React.useEffect(() => {
    if (!inputUrl) return
    return () => URL.revokeObjectURL(inputUrl)
  }, [inputUrl])

  React.useEffect(() => {
    if (!outputUrl) return
    return () => URL.revokeObjectURL(outputUrl)
  }, [outputUrl])

  React.useEffect(() => {
    const supported = supportsVideoCodecs()
    setIsSupported(supported)
    if (!supported) {
      setStatus("WebCodecs not available")
      setError(
        "Your browser does not support WebCodecs + captureStream. Use a recent Chromium or Safari."
      )
    }
  }, [])

  const resetOutput = React.useCallback(() => {
    setOutputUrl(null)
    setOutputSize(null)
    setProgress(null)
  }, [])

  const handleFile = React.useCallback(
    (file: File) => {
      setError(null)
      const looksLikeWebm =
        file.type === "video/webm" || file.name.toLowerCase().endsWith(".webm")
      if (!looksLikeWebm) {
        setError("This file doesn't look like WebM, but we'll try converting it.")
      }
      resetOutput()
      setInputFile(file)
      setInputUrl(URL.createObjectURL(file))
      setStatus("Ready to convert")
    },
    [resetOutput]
  )

  const handleFileInput: React.ChangeEventHandler<HTMLInputElement> = (event) => {
    const file = event.target.files?.[0]
    if (!file) return
    handleFile(file)
  }

  const handleDrop: React.DragEventHandler<HTMLDivElement> = (event) => {
    event.preventDefault()
    setIsDragging(false)
    const file = event.dataTransfer.files?.[0]
    if (file) {
      handleFile(file)
    }
  }

  const runConversion = React.useCallback(async () => {
    if (!inputFile) return
    if (!supportsVideoCodecs()) {
      setError("WebCodecs or captureStream are not available in this browser.")
      return
    }
    if (includeAudio && !supportsAudioCodecs()) {
      setError("Audio WebCodecs are not available. Disable audio or switch browser.")
      return
    }

    setError(null)
    setIsConverting(true)
    setProgress(0)
    resetOutput()

    const workingUrl = inputUrl ?? URL.createObjectURL(inputFile)
    const shouldRevokeWorkingUrl = !inputUrl
    const videoElement = document.createElement("video")
    videoElement.src = workingUrl
    videoElement.muted = true
    videoElement.playsInline = true
    videoElement.preload = "auto"
    videoElement.style.position = "fixed"
    videoElement.style.left = "-9999px"
    videoElement.style.width = "1px"
    videoElement.style.height = "1px"
    document.body.appendChild(videoElement)

    const waitForMetadata = () =>
      new Promise<void>((resolve, reject) => {
        if (videoElement.readyState >= 1) {
          resolve()
          return
        }
        const onLoaded = () => {
          cleanup()
          resolve()
        }
        const onError = () => {
          cleanup()
          reject(new Error("Failed to load video metadata."))
        }
        const cleanup = () => {
          videoElement.removeEventListener("loadedmetadata", onLoaded)
          videoElement.removeEventListener("error", onError)
        }
        videoElement.addEventListener("loadedmetadata", onLoaded, { once: true })
        videoElement.addEventListener("error", onError, { once: true })
      })

    let progressTimer: number | null = null
    const stopProgressTimer = () => {
      if (progressTimer) {
        window.clearInterval(progressTimer)
        progressTimer = null
      }
    }

    try {
      setStatus("Preparing codecs")
      const { Muxer, ArrayBufferTarget } = await import("mp4-muxer")
      await waitForMetadata()

      const durationSeconds = Number.isFinite(videoElement.duration)
        ? videoElement.duration
        : duration ?? null
      if (durationSeconds && !duration) {
        setDuration(durationSeconds)
      }

      const capture = (
        videoElement as HTMLVideoElement & {
          captureStream?: () => MediaStream
          webkitCaptureStream?: () => MediaStream
        }
      ).captureStream
        ? (videoElement as HTMLVideoElement & { captureStream?: () => MediaStream }).captureStream?.bind(
            videoElement
          )
        : (videoElement as HTMLVideoElement & { webkitCaptureStream?: () => MediaStream })
            .webkitCaptureStream
      const stream = capture ? capture() : null
      if (!stream) {
        throw new Error("captureStream is not available in this browser.")
      }

      const [videoTrack] = stream.getVideoTracks()
      if (!videoTrack) {
        throw new Error("No video track found in this file.")
      }

      const videoSettings = videoTrack.getSettings()
      const widthSource = videoSettings.width ?? (videoElement.videoWidth || 0)
      const heightSource = videoSettings.height ?? (videoElement.videoHeight || 0)
      const width = evenDimension(widthSource || 1280)
      const height = evenDimension(heightSource || 720)
      const frameRate = videoSettings.frameRate ?? 30
      const baseBitrate = Math.max(1_500_000, Math.round(width * height * frameRate * 0.07))
      const videoBitrate = Math.round(baseBitrate * quality.bitrateScale)
      const audioBitrate =
        quality.id === "high" ? 192_000 : quality.id === "small" ? 96_000 : 128_000

      const Processor = (window as unknown as {
        MediaStreamTrackProcessor?: new (options: { track: MediaStreamTrack }) => {
          readable: ReadableStream<VideoFrame | AudioData>
        }
      }).MediaStreamTrackProcessor
      if (!Processor) {
        throw new Error("MediaStreamTrackProcessor is not available in this browser.")
      }

      const videoProcessor = new Processor({ track: videoTrack }) as {
        readable: ReadableStream<VideoFrame>
      }
      const videoReader = videoProcessor.readable.getReader()

      const [audioTrack] = stream.getAudioTracks()
      let includeAudioTrack = includeAudio && !!audioTrack
      let audioReader: ReadableStreamDefaultReader<AudioData> | null = null
      let bufferedAudio: AudioData | null = null
      let audioSampleRate: number | undefined
      let audioChannels: number | undefined

      if (includeAudioTrack && audioTrack) {
        const audioProcessor = new Processor({ track: audioTrack }) as {
          readable: ReadableStream<AudioData>
        }
        audioReader = audioProcessor.readable.getReader()
        const audioSettings = audioTrack.getSettings()
        audioSampleRate = audioSettings.sampleRate ?? undefined
        audioChannels = audioSettings.channelCount ?? undefined
      }

      setStatus("Starting playback")
      try {
        await videoElement.play()
      } catch (err) {
        throw new Error("Playback was blocked. Click convert again to allow it.")
      }

      if (includeAudioTrack && audioReader && (!audioSampleRate || !audioChannels)) {
        setStatus("Analyzing audio")
        const first = await audioReader.read()
        if (!first.done && first.value) {
          bufferedAudio = first.value
          audioSampleRate = bufferedAudio.sampleRate
          audioChannels = bufferedAudio.numberOfChannels
        }
      }

      if (includeAudioTrack && (!audioSampleRate || !audioChannels)) {
        includeAudioTrack = false
        if (bufferedAudio) {
          bufferedAudio.close()
          bufferedAudio = null
        }
        setStatus("Audio track not detected, exporting video only")
      }

      setStatus("Configuring encoders")
      const videoBaseConfig: Omit<VideoEncoderConfig, "codec"> = {
        width,
        height,
        bitrate: videoBitrate,
        framerate: frameRate,
      }

      const codecCandidates = ["avc1.42E01E", "avc1.4D401E", "avc1.640028", "avc1.42001E"]
      const videoConfigCandidates: VideoEncoderConfig[] = []
      for (const codec of codecCandidates) {
        videoConfigCandidates.push({
          codec,
          ...videoBaseConfig,
          latencyMode: speed.latencyMode,
          hardwareAcceleration: "prefer-hardware",
        })
        videoConfigCandidates.push({
          codec,
          ...videoBaseConfig,
          latencyMode: speed.latencyMode,
        })
        videoConfigCandidates.push({
          codec,
          ...videoBaseConfig,
          hardwareAcceleration: "prefer-hardware",
        })
        videoConfigCandidates.push({
          codec,
          ...videoBaseConfig,
        })
      }

      let chosenVideoConfig: VideoEncoderConfig | null = null
      for (const candidate of videoConfigCandidates) {
        const support = await VideoEncoder.isConfigSupported(candidate)
        if (support.supported) {
          chosenVideoConfig = support.config ?? candidate
          break
        }
      }

      if (!chosenVideoConfig) {
        throw new Error("H.264 encoding is not supported in this browser.")
      }

      let audioEnabled = includeAudioTrack && !!audioSampleRate && !!audioChannels
      let audioEncoderConfig: AudioEncoderConfig | null = null
      if (audioEnabled && audioSampleRate && audioChannels) {
        audioEncoderConfig = {
          codec: "mp4a.40.2",
          sampleRate: audioSampleRate,
          numberOfChannels: audioChannels,
          bitrate: audioBitrate,
        }
        const audioSupport = await AudioEncoder.isConfigSupported(audioEncoderConfig)
        if (!audioSupport.supported) {
          audioEnabled = false
          audioEncoderConfig = null
          setStatus("AAC not supported, exporting video only")
        }
      }

      const target = new ArrayBufferTarget()
      const muxer = new Muxer({
        target,
        firstTimestampBehavior: "offset",
        video: {
          codec: "avc",
          width,
          height,
        },
        audio:
          audioEnabled && audioSampleRate && audioChannels
            ? {
                codec: "aac",
                sampleRate: audioSampleRate,
                numberOfChannels: audioChannels,
              }
            : undefined,
      })

      let videoMeta: EncodedVideoChunkMetadata | null = null
      const videoEncoder = new VideoEncoder({
        output: (chunk, meta) => {
          if (meta) {
            videoMeta = meta
          }
          if (!videoMeta) {
            throw new Error("Missing video encoder metadata.")
          }
          muxer.addVideoChunk(chunk, videoMeta)
        },
        error: (err) => {
          console.error(err)
        },
      })
      videoEncoder.configure(chosenVideoConfig)

      let audioEncoder: AudioEncoder | null = null
      let audioMeta: EncodedAudioChunkMetadata | null = null
      if (audioEnabled && audioEncoderConfig) {
        audioEncoder = new AudioEncoder({
          output: (chunk, meta) => {
            if (meta) {
              audioMeta = meta
            }
            if (!audioMeta) {
              throw new Error("Missing audio encoder metadata.")
            }
            muxer.addAudioChunk(chunk, audioMeta)
          },
          error: (err) => {
            console.error(err)
          },
        })
        audioEncoder.configure(audioEncoderConfig)
      }

      let progressOffsetUs: number | null = null
      const updateProgress = (timestampUs?: number) => {
        if (!durationSeconds) return
        let timeSeconds = videoElement.currentTime
        if (typeof timestampUs === "number") {
          if (progressOffsetUs === null) {
            progressOffsetUs = timestampUs
          }
          timeSeconds = Math.max(0, (timestampUs - progressOffsetUs) / 1_000_000)
        }
        const pct = Math.min(100, Math.round((timeSeconds / durationSeconds) * 100))
        setProgress((prev) => Math.max(prev ?? 0, pct))
      }

      if (durationSeconds) {
        progressTimer = window.setInterval(() => {
          updateProgress()
        }, 200)
      }

      setStatus(audioEnabled ? "Encoding video + audio" : "Encoding video")
      const keyInterval = Math.max(1, Math.round(frameRate * speed.gopSeconds))
      let videoFrameCount = 0

      const videoTask = (async () => {
        while (true) {
          const result = await videoReader.read()
          if (result.done) break
          const frame = result.value
          videoFrameCount += 1
          videoEncoder.encode(frame, { keyFrame: videoFrameCount % keyInterval === 0 })
          updateProgress(frame.timestamp)
          frame.close()
          if (videoEncoder.encodeQueueSize > 12) {
            await waitForBreathingRoom()
          }
        }
      })()

      const audioTask = (async () => {
        if (!audioEnabled || !audioReader || !audioEncoder) return
        if (bufferedAudio) {
          audioEncoder.encode(bufferedAudio)
          updateProgress(bufferedAudio.timestamp)
          bufferedAudio.close()
          bufferedAudio = null
        }
        while (true) {
          const result = await audioReader.read()
          if (result.done) break
          const data = result.value
          audioEncoder.encode(data)
          updateProgress(data.timestamp)
          data.close()
          if (audioEncoder.encodeQueueSize > 20) {
            await waitForBreathingRoom()
          }
        }
      })()

      await new Promise<void>((resolve, reject) => {
        videoElement.addEventListener("ended", () => resolve(), { once: true })
        videoElement.addEventListener("error", () => reject(new Error("Playback failed.")), {
          once: true,
        })
      })

      videoElement.pause()
      videoTrack.stop()
      audioTrack?.stop()

      await Promise.all([videoTask, audioTask])

      await videoEncoder.flush()
      videoEncoder.close()
      if (audioEncoder) {
        await audioEncoder.flush()
        audioEncoder.close()
      }

      setStatus("Finalizing MP4")
      muxer.finalize()
      const outputBuffer = (target as { buffer: ArrayBuffer }).buffer
      const outputBlob = new Blob([outputBuffer], { type: "video/mp4" })
      setOutputSize(outputBlob.size)
      setOutputUrl(URL.createObjectURL(outputBlob))
      setStatus("Conversion complete")
      setProgress(100)
    } catch (err) {
      console.error(err)
      const message =
        err instanceof Error ? err.message : "Conversion failed. Try another file or a different browser."
      setError(message)
      setStatus("Conversion failed")
    } finally {
      stopProgressTimer()
      videoElement.pause()
      videoElement.src = ""
      if (videoElement.parentNode) {
        videoElement.parentNode.removeChild(videoElement)
      }
      if (shouldRevokeWorkingUrl) {
        URL.revokeObjectURL(workingUrl)
      }
      setIsConverting(false)
    }
  }, [duration, includeAudio, inputFile, inputUrl, quality, resetOutput, speed])

  const handleClear = () => {
    setInputFile(null)
    setInputUrl(null)
    resetOutput()
    setDuration(null)
    setStatus("Ready")
    setError(null)
  }

  const onLoadedMetadata: React.ReactEventHandler<HTMLVideoElement> = (event) => {
    const video = event.currentTarget
    if (Number.isFinite(video.duration)) {
      setDuration(video.duration)
    }
  }

  return (
    <div className="relative min-h-screen overflow-hidden">
      <div className="pointer-events-none absolute -top-40 left-[-10%] h-[30rem] w-[30rem] rounded-full bg-[oklch(0.86_0.14_190_/_0.35)] blur-[120px] animate-blob" />
      <div className="pointer-events-none absolute -top-24 right-[-12%] h-[26rem] w-[26rem] rounded-full bg-[oklch(0.9_0.12_60_/_0.4)] blur-[140px] animate-blob animation-delay-2000" />
      <div className="pointer-events-none absolute bottom-[-12%] left-[30%] h-[28rem] w-[28rem] rounded-full bg-[oklch(0.92_0.08_30_/_0.35)] blur-[120px] animate-blob animation-delay-4000" />

      <main className="relative mx-auto flex min-h-screen w-full max-w-6xl flex-col gap-10 px-6 pb-16 pt-12 md:pt-16">
        <header className="flex flex-col gap-4">
          <div className="inline-flex w-fit items-center gap-2 rounded-full border border-border/70 bg-white/70 px-4 py-1 text-xs font-medium uppercase tracking-[0.2em] text-foreground/70 shadow-sm">
            <SparklesIcon className="h-3.5 w-3.5" />
            WebCodecs + MP4 Muxer
          </div>
          <h1 className="text-4xl font-semibold tracking-tight text-foreground md:text-6xl">
            WebM to MP4, fully in-browser.
          </h1>
          <p className="max-w-2xl text-base text-foreground/70 md:text-lg">
            High-performance conversion using WebCodecs and an MP4 muxer. Everything stays
            on your device.
          </p>
        </header>

        <section className="grid gap-8 lg:grid-cols-[1.05fr_0.95fr]">
          <div className="flex h-full flex-col gap-6 rounded-3xl border border-border/70 bg-white/70 p-6 shadow-[0_24px_60px_-40px_rgba(15,23,42,0.35)] backdrop-blur">
            <div
              className={cn(
                "group relative flex min-h-[220px] flex-col items-center justify-center gap-4 rounded-2xl border border-dashed border-border/80 bg-white/50 px-6 py-10 text-center transition",
                isDragging && "border-foreground/70 bg-white/80"
              )}
              onDragOver={(event) => {
                event.preventDefault()
                setIsDragging(true)
              }}
              onDragLeave={() => setIsDragging(false)}
              onDrop={handleDrop}
            >
              <div className="flex h-16 w-16 items-center justify-center rounded-2xl bg-foreground text-background shadow-lg shadow-foreground/20">
                <UploadCloudIcon className="h-8 w-8" />
              </div>
              <div className="space-y-2">
                <p className="text-lg font-semibold text-foreground">
                  Drop a WebM file here
                </p>
                <p className="text-sm text-foreground/60">
                  Or pick one from your device. Large files are fine.
                </p>
              </div>
              <label className="cursor-pointer rounded-full bg-foreground px-5 py-2 text-sm font-semibold text-background transition hover:translate-y-[-1px] hover:shadow-lg hover:shadow-foreground/25">
                Choose file
                <input
                  type="file"
                  accept="video/webm"
                  className="hidden"
                  onChange={handleFileInput}
                />
              </label>
              {inputFile ? (
                <div className="absolute bottom-4 left-4 right-4 flex flex-wrap items-center justify-between gap-3 rounded-xl border border-border/60 bg-white/80 px-4 py-3 text-left text-sm text-foreground/70">
                  <div className="flex items-center gap-3">
                    <FileIcon className="h-4 w-4 text-foreground/60" />
                    <div>
                      <p className="font-medium text-foreground">{inputFile.name}</p>
                      <p className="text-xs text-foreground/60">
                        {formatBytes(inputFile.size)} · {formatDuration(duration)}
                      </p>
                    </div>
                  </div>
                  <button
                    type="button"
                    className="text-xs font-semibold uppercase tracking-[0.2em] text-foreground/70 hover:text-foreground"
                    onClick={handleClear}
                  >
                    Clear
                  </button>
                </div>
              ) : null}
            </div>

            <div className="grid gap-6 md:grid-cols-2">
              <div>
                <p className="mb-3 text-sm font-semibold text-foreground/80">
                  Quality
                </p>
                <div className="flex flex-col gap-2">
                  {qualityPresets.map((preset) => (
                    <button
                      key={preset.id}
                      type="button"
                      onClick={() => setQuality(preset)}
                      className={cn(
                        "flex items-center justify-between rounded-2xl border px-4 py-3 text-left text-sm transition",
                        preset.id === quality.id
                          ? "border-foreground/80 bg-foreground text-background shadow-lg shadow-foreground/15"
                          : "border-border/70 bg-white/70 text-foreground/80 hover:border-foreground/50"
                      )}
                    >
                      <div>
                        <p className="font-semibold">{preset.label}</p>
                        <p
                          className={cn(
                            "text-xs",
                            preset.id === quality.id ? "text-background/70" : "text-foreground/60"
                          )}
                        >
                          {preset.hint}
                        </p>
                      </div>
                      <span className="text-xs font-semibold uppercase tracking-[0.2em]">
                        {Math.round(preset.bitrateScale * 100)}%
                      </span>
                    </button>
                  ))}
                </div>
              </div>

              <div>
                <p className="mb-3 text-sm font-semibold text-foreground/80">
                  Speed
                </p>
                <div className="flex flex-col gap-2">
                  {speedPresets.map((preset) => (
                    <button
                      key={preset.id}
                      type="button"
                      onClick={() => setSpeed(preset)}
                      className={cn(
                        "flex items-center justify-between rounded-2xl border px-4 py-3 text-left text-sm transition",
                        preset.id === speed.id
                          ? "border-foreground/80 bg-foreground text-background shadow-lg shadow-foreground/15"
                          : "border-border/70 bg-white/70 text-foreground/80 hover:border-foreground/50"
                      )}
                    >
                      <div>
                        <p className="font-semibold">{preset.label}</p>
                        <p
                          className={cn(
                            "text-xs",
                            preset.id === speed.id ? "text-background/70" : "text-foreground/60"
                          )}
                        >
                          {preset.hint}
                        </p>
                      </div>
                      <span className="text-xs font-semibold uppercase tracking-[0.2em]">
                        {preset.gopSeconds}s GOP
                      </span>
                    </button>
                  ))}
                </div>
              </div>
            </div>

            <div className="flex flex-wrap items-center justify-between gap-3 rounded-2xl border border-border/70 bg-white/70 px-4 py-4 text-sm text-foreground/80">
              <label className="flex items-center gap-3">
                <input
                  type="checkbox"
                  className="h-4 w-4 rounded border-border"
                  checked={includeAudio}
                  onChange={(event) => setIncludeAudio(event.target.checked)}
                />
                Keep audio track
              </label>
              <div className="text-xs text-foreground/60">
                Removes audio if unchecked
              </div>
            </div>

            <div className="flex flex-wrap items-center gap-4">
              <button
                type="button"
                disabled={!inputFile || isConverting || !isSupported}
                onClick={runConversion}
                className="group inline-flex items-center gap-2 rounded-full bg-foreground px-6 py-3 text-sm font-semibold text-background transition hover:translate-y-[-1px] hover:shadow-lg hover:shadow-foreground/30 disabled:cursor-not-allowed disabled:opacity-60"
              >
                {isConverting ? (
                  <LoaderCircleIcon className="h-4 w-4 animate-spin" />
                ) : null}
                {isConverting ? "Converting" : "Convert to MP4"}
              </button>
              <span className="text-xs text-foreground/60">
                Uses WebCodecs for hardware-accelerated encoding
              </span>
            </div>

            <div className="flex flex-col gap-2 rounded-2xl border border-border/70 bg-white/70 px-4 py-4 text-sm">
              <div className="flex items-center justify-between text-xs uppercase tracking-[0.2em] text-foreground/50">
                <span>Status</span>
                <span>{progress !== null ? `${progress}%` : "—"}</span>
              </div>
              <div className="text-base font-semibold text-foreground">{status}</div>
              <div className="h-2 overflow-hidden rounded-full bg-foreground/10">
                <div
                  className="h-full rounded-full bg-foreground transition-all duration-300"
                  style={{ width: `${progress ?? 0}%` }}
                />
              </div>
              {error ? <p className="text-sm text-red-600">{error}</p> : null}
            </div>
          </div>

          <div className="flex flex-col gap-6">
            <div className="rounded-3xl border border-border/70 bg-white/70 p-6 backdrop-blur">
              <p className="text-sm font-semibold text-foreground">Input preview</p>
              {inputUrl ? (
                <video
                  className="mt-4 w-full rounded-2xl border border-border/70"
                  controls
                  src={inputUrl}
                  onLoadedMetadata={onLoadedMetadata}
                />
              ) : (
                <div className="mt-4 rounded-2xl border border-dashed border-border/70 bg-white/60 px-4 py-8 text-center text-sm text-foreground/60">
                  Add a WebM file to preview it here.
                </div>
              )}
            </div>

            <div className="rounded-3xl border border-border/70 bg-white/70 p-6 shadow-[0_24px_60px_-40px_rgba(15,23,42,0.35)] backdrop-blur">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-sm uppercase tracking-[0.2em] text-foreground/50">
                    Output
                  </p>
                  <p className="text-xl font-semibold text-foreground">MP4 Download</p>
                </div>
                <div className="rounded-full bg-foreground/10 px-3 py-1 text-xs font-semibold text-foreground/70">
                  {outputSize ? formatBytes(outputSize) : "—"}
                </div>
              </div>

              {outputUrl ? (
                <div className="mt-5">
                  <a
                    href={outputUrl}
                    download={inputFile ? inputFile.name.replace(/\.webm$/i, ".mp4") : "video.mp4"}
                    className="inline-flex w-full items-center justify-center gap-2 rounded-full bg-foreground px-5 py-3 text-sm font-semibold text-background transition hover:translate-y-[-1px] hover:shadow-lg hover:shadow-foreground/25"
                  >
                    <DownloadIcon className="h-4 w-4" />
                    Download MP4
                  </a>
                </div>
              ) : (
                <div className="mt-6 rounded-2xl border border-dashed border-border/70 bg-white/70 px-4 py-10 text-center text-sm text-foreground/60">
                  Convert a file to unlock the download button.
                </div>
              )}
            </div>
          </div>
        </section>
      </main>
    </div>
  )
}
