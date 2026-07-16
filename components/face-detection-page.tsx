"use client";

import { useRef, useState, useCallback, useEffect } from "react";
import { Camera, Upload, Scan, AlertTriangle, CheckCircle2, Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Spinner } from "@/components/ui/spinner";
import { ErrorState } from "@/components/states/error-state";
import { EmptyState } from "@/components/states/empty-state";
import { PageHeader } from "@/components/layout/page-header";
import { Container } from "@/components/layout/container";
import { loadModels, detectFaces, drawDetections, type FaceResult } from "@/lib/face-detect";

type AppState = "idle" | "loading-models" | "ready" | "detecting" | "done" | "error";

export default function FaceDetectionPage() {
  const imgRef = useRef<HTMLImageElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const videoRef = useRef<HTMLVideoElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const animFrameRef = useRef<number>(0);

  const [state, setState] = useState<AppState>("idle");
  const [error, setError] = useState<string>("");
  const [imageUrl, setImageUrl] = useState<string>("");
  const [detections, setDetections] = useState<FaceResult[]>([]);
  const [cameraActive, setCameraActive] = useState(false);
  const [modelLoadProgress, setModelLoadProgress] = useState(0);

  // ── Initialise models on mount ────────────────────────────────
  useEffect(() => {
    let cancelled = false;
    (async () => {
      setState("loading-models");
      setModelLoadProgress(30);
      try {
        await loadModels();
        if (!cancelled) {
          setModelLoadProgress(100);
          setState("ready");
        }
      } catch (e) {
        if (!cancelled) {
          setError(e instanceof Error ? e.message : "Failed to load face detection models");
          setState("error");
        }
      }
    })();
    return () => { cancelled = true; };
  }, []);

  // ── Handle file upload ────────────────────────────────────────
  const handleFile = useCallback((file: File) => {
    if (!file.type.startsWith("image/")) return;
    setCameraActive(false);
    cancelAnimationFrame(animFrameRef.current);
    const url = URL.createObjectURL(file);
    setImageUrl(url);
    setDetections([]);
  }, []);

  const onFileChange = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) handleFile(file);
  }, [handleFile]);

  const onDrop = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    const file = e.dataTransfer.files?.[0];
    if (file) handleFile(file);
  }, [handleFile]);

  // ── Run detection on the loaded image ─────────────────────────
  const runDetection = useCallback(async () => {
    const img = imgRef.current;
    const canvas = canvasRef.current;
    if (!img || !canvas || !img.complete || img.naturalWidth === 0) return;

    setState("detecting");
    try {
      const results = await detectFaces(img);
      setDetections(results);

      // Match canvas size to rendered image size.
      canvas.width = img.naturalWidth;
      canvas.height = img.naturalHeight;
      drawDetections(canvas, results, img.naturalWidth, img.naturalHeight);
      setState("done");
    } catch (e) {
      setError(e instanceof Error ? e.message : "Detection failed");
      setState("error");
    }
  }, []);

  // Auto-detect when image loads.
  useEffect(() => {
    if (imageUrl && state === "ready") runDetection();
  }, [imageUrl, state, runDetection]);

  // ── Camera live feed ──────────────────────────────────────────
  const startCamera = useCallback(async () => {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ video: { facingMode: "user", width: 640, height: 480 } });
      if (videoRef.current) {
        videoRef.current.srcObject = stream;
        await videoRef.current.play();
        setCameraActive(true);
        setImageUrl("");
        setDetections([]);
        // Start detection loop.
        detectLoop();
      }
    } catch (e) {
      setError("Camera access denied or unavailable");
      setState("error");
    }
  }, []);

  const detectLoop = useCallback(() => {
    const video = videoRef.current;
    const canvas = canvasRef.current;
    if (!video || !canvas || video.paused || video.ended) return;

    if (video.readyState >= 2) {
      canvas.width = video.videoWidth;
      canvas.height = video.videoHeight;
      detectFaces(video).then((results) => {
        setDetections(results);
        drawDetections(canvas, results, video.videoWidth, video.videoHeight);
      }).catch(() => { /* skip frame */ });
    }
    animFrameRef.current = requestAnimationFrame(detectLoop);
  }, []);

  const stopCamera = useCallback(() => {
    cancelAnimationFrame(animFrameRef.current);
    if (videoRef.current?.srcObject) {
      (videoRef.current.srcObject as MediaStream).getTracks().forEach((t) => t.stop());
      videoRef.current.srcObject = null;
    }
    setCameraActive(false);
    const canvas = canvasRef.current;
    if (canvas) {
      canvas.getContext("2d")?.clearRect(0, 0, canvas.width, canvas.height);
    }
    setDetections([]);
  }, []);

  // Cleanup on unmount.
  useEffect(() => {
    return () => {
      cancelAnimationFrame(animFrameRef.current);
      stopCamera();
    };
  }, [stopCamera]);

  const dominantEmotion = detections.length > 0
    ? Object.entries(detections[0].expressions).sort((a, b) => b[1] - a[1])[0]
    : null;

  return (
    <div className="min-h-screen bg-background">
      <Container className="py-8">
        <PageHeader
          title="Facely"
          description="Real-time face detection in your browser. Upload an image or use your camera."
          actions={
            <div className="flex gap-2">
              <Button
                variant="outline"
                onClick={() => fileInputRef.current?.click()}
                disabled={state === "loading-models" || state === "detecting"}
              >
                <Upload className="mr-2 h-4 w-4" />
                Upload Image
              </Button>
              <Button
                onClick={cameraActive ? stopCamera : startCamera}
                disabled={state === "loading-models" || state === "detecting"}
                variant={cameraActive ? "destructive" : "default"}
              >
                <Camera className="mr-2 h-4 w-4" />
                {cameraActive ? "Stop Camera" : "Use Camera"}
              </Button>
              <input
                ref={fileInputRef}
                type="file"
                accept="image/*"
                className="hidden"
                onChange={onFileChange}
              />
            </div>
          }
        />

        {/* ── Loading state ──────────────────────────────────── */}
        {state === "loading-models" && (
          <Card>
            <CardContent className="flex flex-col items-center justify-center py-20">
              <Spinner className="mb-6 h-12 w-12 text-primary" />
              <CardTitle className="mb-2">Loading Face Detection Models</CardTitle>
              <CardDescription className="text-center max-w-md">
                Downloading ~5 MB of AI models to your browser. This only happens once — subsequent loads are instant.
              </CardDescription>
              <div className="mt-6 h-2 w-64 rounded-full bg-muted overflow-hidden">
                <div
                  className="h-full bg-primary rounded-full transition-all duration-500"
                  style={{ width: `${modelLoadProgress}%` }}
                />
              </div>
            </CardContent>
          </Card>
        )}

        {/* ── Error state ────────────────────────────────────── */}
        {state === "error" && (
          <ErrorState
            title="Something went wrong"
            description={error}
            onRetry={() => {
              setState("idle");
              setError("");
              setModelLoadProgress(0);
              // Re-trigger model loading.
              setState("loading-models");
              setModelLoadProgress(30);
              loadModels().then(() => {
                setModelLoadProgress(100);
                setState("ready");
              }).catch((e) => {
                setError(e instanceof Error ? e.message : "Failed to load face detection models");
                setState("error");
              });
            }}
          />
        )}

        {/* ── Ready / Detecting / Done — main content ────────── */}
        {(state === "ready" || state === "detecting" || state === "done") && (
          <div className="grid gap-6 lg:grid-cols-3">
            {/* Preview area */}
            <div className="lg:col-span-2">
              <Card>
                <CardHeader>
                  <CardTitle className="flex items-center gap-2">
                    <Scan className="h-5 w-5 text-primary" />
                    Detection Preview
                  </CardTitle>
                </CardHeader>
                <CardContent>
                  {/* Drop zone / image area */}
                  <div
                    className={`relative flex items-center justify-center rounded-lg border-2 border-dashed transition-colors ${
                      imageUrl || cameraActive
                        ? "border-transparent"
                        : "border-muted-foreground/25 hover:border-primary/50 cursor-pointer"
                    }`}
                    style={{ minHeight: 400 }}
                    onDragOver={(e) => e.preventDefault()}
                    onDrop={onDrop}
                    onClick={() => !imageUrl && !cameraActive && fileInputRef.current?.click()}
                  >
                    {!imageUrl && !cameraActive && (
                      <div className="flex flex-col items-center gap-3 text-muted-foreground">
                        <Upload className="h-12 w-12" />
                        <p className="text-lg font-medium">Drop an image here</p>
                        <p className="text-sm">or click to browse</p>
                      </div>
                    )}

                    {/* Hidden image for detection */}
                    {imageUrl && (
                      <img
                        ref={imgRef}
                        src={imageUrl}
                        alt="Uploaded"
                        className="max-h-[500px] w-full rounded-lg object-contain"
                        onLoad={runDetection}
                      />
                    )}

                    {/* Camera feed */}
                    {cameraActive && (
                      <video
                        ref={videoRef}
                        autoPlay
                        playsInline
                        muted
                        className="max-h-[500px] w-full rounded-lg object-contain"
                      />
                    )}

                    {/* Detection overlay canvas */}
                    <canvas
                      ref={canvasRef}
                      className="pointer-events-none absolute inset-0 h-full w-full rounded-lg"
                    />

                    {/* Detecting overlay */}
                    {state === "detecting" && (
                      <div className="absolute inset-0 flex items-center justify-center rounded-lg bg-background/60 backdrop-blur-sm">
                        <div className="flex flex-col items-center gap-2">
                          <Loader2 className="h-8 w-8 animate-spin text-primary" />
                          <p className="text-sm font-medium text-foreground">Analysing faces…</p>
                        </div>
                      </div>
                    )}
                  </div>
                </CardContent>
              </Card>
            </div>

            {/* Results sidebar */}
            <div className="space-y-4">
              <Card>
                <CardHeader>
                  <CardTitle className="flex items-center gap-2 text-base">
                    <CheckCircle2 className="h-4 w-4 text-primary" />
                    Detection Results
                  </CardTitle>
                </CardHeader>
                <CardContent>
                  {detections.length === 0 ? (
                    <EmptyState
                      title="No faces detected"
                      description="Upload an image or start the camera to see results."
                    />
                  ) : (
                    <div className="space-y-3">
                      <div className="flex items-center gap-2">
                        <Badge tone="default" className="text-sm px-3 py-1">
                          {detections.length} face{detections.length !== 1 ? "s" : ""} found
                        </Badge>
                      </div>
                      {dominantEmotion && (
                        <div className="rounded-lg bg-muted p-3">
                          <p className="text-xs text-muted-foreground mb-1">Dominant Emotion</p>
                          <p className="text-xl font-semibold capitalize">
                            {dominantEmotion[0]}
                            <span className="text-sm font-normal text-muted-foreground ml-2">
                              {(dominantEmotion[1] * 100).toFixed(1)}%
                            </span>
                          </p>
                        </div>
                      )}
                      {detections.map((d, i) => (
                        <div key={i} className="rounded-lg border p-3 text-sm">
                          <p className="font-medium mb-1">Face #{i + 1}</p>
                          <p className="text-muted-foreground">
                            Confidence: {(d.score * 100).toFixed(1)}%
                          </p>
                          <div className="mt-2 flex flex-wrap gap-1">
                            {Object.entries(d.expressions)
                              .sort((a, b) => b[1] - a[1])
                              .slice(0, 3)
                              .map(([expr, val]) => (
                                <Badge key={expr} tone="default" className="text-xs capitalize">
                                  {expr}: {(val * 100).toFixed(0)}%
                                </Badge>
                              ))}
                          </div>
                        </div>
                      ))}
                    </div>
                  )}
                </CardContent>
              </Card>
            </div>
          </div>
        )}

        {/* ── Idle (before models loaded — shouldn't normally show) ── */}
        {state === "idle" && (
          <Card>
            <CardContent className="flex flex-col items-center justify-center py-20">
              <Scan className="mb-4 h-16 w-16 text-muted-foreground/40" />
              <CardTitle className="mb-2">Initialising</CardTitle>
              <CardDescription>Preparing face detection engine…</CardDescription>
            </CardContent>
          </Card>
        )}
      </Container>
    </div>
  );
}
