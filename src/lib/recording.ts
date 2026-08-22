export type RecordingState = 'recording' | 'stopped';

let recorder: MediaRecorder | null = null;
let recordedChunks: Blob[] = [];
let recordingStreams: MediaStream[] = [];

const safeFilePart = (value: string) => value
  .normalize('NFKC')
  .replace(/[\\/:*?"<>|]/g, '-')
  .replace(/\s+/g, '-')
  .slice(0, 60) || 'lesson';

const stopStreams = (): void => {
  recordingStreams.forEach(stream => stream.getTracks().forEach(track => track.stop()));
  recordingStreams = [];
};

export function isRecording(): boolean {
  return recorder?.state === 'recording';
}

export async function startLessonRecording(
  studentLabel: string,
  onStateChange: (state: RecordingState) => void,
): Promise<void> {
  if (isRecording()) throw new Error('すでに録画中です。先に録画を停止してください。');
  if (!navigator.mediaDevices?.getDisplayMedia || typeof MediaRecorder === 'undefined') {
    throw new Error('このブラウザは画面録画に対応していません。Chromeの最新版でお試しください。');
  }

  let displayStream: MediaStream | null = null;
  let micStream: MediaStream | null = null;
  try {
    displayStream = await navigator.mediaDevices.getDisplayMedia({ video: true, audio: true });
    try { micStream = await navigator.mediaDevices.getUserMedia({ audio: true }); }
    catch { /* Tab audio still works when microphone permission is declined. */ }

    const combined = new MediaStream([
      ...displayStream.getVideoTracks(),
      ...displayStream.getAudioTracks(),
      ...(micStream?.getAudioTracks() ?? []),
    ]);
    recordingStreams = [displayStream, ...(micStream ? [micStream] : [])];
    recordedChunks = [];

    const preferred = ['video/webm;codecs=vp9,opus', 'video/webm;codecs=vp8,opus', 'video/webm']
      .find(type => MediaRecorder.isTypeSupported(type));
    recorder = preferred ? new MediaRecorder(combined, { mimeType: preferred }) : new MediaRecorder(combined);
    recorder.addEventListener('dataavailable', event => {
      if (event.data.size > 0) recordedChunks.push(event.data);
    });
    recorder.addEventListener('stop', () => {
      const mimeType = recorder?.mimeType || preferred || 'video/webm';
      const extension = mimeType.includes('mp4') ? 'mp4' : 'webm';
      const blob = new Blob(recordedChunks, { type: mimeType });
      const url = URL.createObjectURL(blob);
      const anchor = document.createElement('a');
      const timestamp = new Date().toISOString().slice(0, 19).replace(/[:T]/g, '-');
      anchor.href = url;
      anchor.download = `${safeFilePart(studentLabel)}-${timestamp}.${extension}`;
      document.body.append(anchor);
      anchor.click();
      anchor.remove();
      window.setTimeout(() => URL.revokeObjectURL(url), 3000);
      stopStreams();
      recorder = null;
      recordedChunks = [];
      onStateChange('stopped');
    }, { once: true });
    displayStream.getVideoTracks()[0]?.addEventListener('ended', () => stopLessonRecording(), { once: true });
    recorder.start();
    onStateChange('recording');
  } catch (error) {
    stopStreams();
    recorder = null;
    recordedChunks = [];
    throw error;
  }
}

export function stopLessonRecording(): void {
  if (recorder && recorder.state !== 'inactive') recorder.stop();
}
