/**
 * Server component — delegates to the client-only face detection page
 * via next/dynamic with ssr:false so @vladmandic/face-api never runs
 * on the server (avoids TextEncoder errors from TensorFlow.js).
 */
import dynamic from "next/dynamic";

const FaceDetectionPage = dynamic(
  () => import("@/components/face-detection-page"),
  { ssr: false },
);

export default function Page() {
  return <FaceDetectionPage />;
}
