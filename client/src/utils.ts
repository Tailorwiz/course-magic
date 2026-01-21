import { Course, Module, VisualAsset, Lesson, SupportTicket } from './types';

declare var JSZip: any;

export function pcmToWav(pcmData: Uint8Array, sampleRate: number = 24000, numChannels: number = 1): Blob {
  const bufferLength = pcmData.length;
  const headerLength = 44;
  const wavBuffer = new ArrayBuffer(headerLength + bufferLength);
  const view = new DataView(wavBuffer);
  writeString(view, 0, 'RIFF');
  view.setUint32(4, 36 + bufferLength, true);
  writeString(view, 8, 'WAVE');
  writeString(view, 12, 'fmt ');
  view.setUint32(16, 16, true);
  view.setUint16(20, 1, true);
  view.setUint16(22, numChannels, true);
  view.setUint32(24, sampleRate, true);
  view.setUint32(28, sampleRate * numChannels * 2, true);
  view.setUint16(32, numChannels * 2, true);
  view.setUint16(34, 16, true);
  writeString(view, 36, 'data');
  view.setUint32(40, bufferLength, true);
  const pcmArray = new Uint8Array(wavBuffer, headerLength);
  pcmArray.set(pcmData);
  return new Blob([wavBuffer], { type: 'audio/wav' });
}

function writeString(view: DataView, offset: number, string: string) {
  for (let i = 0; i < string.length; i++) {
    view.setUint8(offset + i, string.charCodeAt(i));
  }
}

export const getAudioDurationFromBlob = async (blob: Blob): Promise<number> => {
  try {
    const arrayBuffer = await blob.arrayBuffer();
    const audioContext = new (window.AudioContext || (window as any).webkitAudioContext)();
    const audioBuffer = await audioContext.decodeAudioData(arrayBuffer);
    const duration = audioBuffer.duration;
    audioContext.close();
    return duration;
  } catch (e) {
    console.error("Error decoding audio duration:", e);
    return 0;
  }
};

export const createSolidColorImage = (color: string = '#4f46e5', text?: string): string => {
  const canvas = document.createElement('canvas');
  canvas.width = 1280;
  canvas.height = 720;
  const ctx = canvas.getContext('2d');
  if (ctx) {
    ctx.fillStyle = color;
    ctx.fillRect(0, 0, 1280, 720);
    if (text) {
      ctx.fillStyle = '#ffffff';
      ctx.font = 'bold 60px Inter, sans-serif';
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.fillText(text, 640, 360);
    }
  }
  return canvas.toDataURL('image/jpeg', 0.8).split(',')[1];
};

export const compressBase64Image = (base64Data: string, maxWidth: number = 800, quality: number = 0.6): Promise<string> => {
  return new Promise((resolve) => {
    if (!base64Data || base64Data.startsWith('/') || base64Data.startsWith('http')) {
      resolve(base64Data);
      return;
    }
    const img = new Image();
    img.onload = () => {
      const canvas = document.createElement('canvas');
      let width = img.width;
      let height = img.height;
      if (width > maxWidth) {
        height = Math.round((height * maxWidth) / width);
        width = maxWidth;
      }
      canvas.width = width;
      canvas.height = height;
      const ctx = canvas.getContext('2d');
      if (ctx) {
        ctx.drawImage(img, 0, 0, width, height);
        const compressed = canvas.toDataURL('image/jpeg', quality).split(',')[1];
        resolve(compressed);
      } else {
        resolve(base64Data);
      }
    };
    img.onerror = () => resolve(base64Data);
    const prefix = base64Data.includes(',') ? '' : 'data:image/png;base64,';
    img.src = prefix + base64Data;
  });
};

export const downloadBlob = (blob: Blob, filename: string) => {
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
};

export const convertPdfToImages = async (file: File): Promise<string[]> => {
  if (typeof (window as any).pdfjsLib === 'undefined') {
    alert("PDF library not loaded. Please refresh the page.");
    return [];
  }
  const pdfjs = (window as any).pdfjsLib;
  if (!pdfjs.GlobalWorkerOptions.workerSrc) {
    pdfjs.GlobalWorkerOptions.workerSrc = 'https://cdnjs.cloudflare.com/ajax/libs/pdf.js/3.11.174/pdf.worker.min.js';
  }
  try {
    const arrayBuffer = await file.arrayBuffer();
    const pdf = await pdfjs.getDocument(arrayBuffer).promise;
    const images: string[] = [];
    for (let i = 1; i <= pdf.numPages; i++) {
      const page = await pdf.getPage(i);
      const viewport = page.getViewport({ scale: 1.5 });
      const canvas = document.createElement('canvas');
      const context = canvas.getContext('2d');
      canvas.height = viewport.height;
      canvas.width = viewport.width;
      await page.render({ canvasContext: context, viewport: viewport }).promise;
      images.push(canvas.toDataURL('image/jpeg', 0.8));
    }
    return images;
  } catch (e) {
    console.error("PDF Conversion Error:", e);
    throw e;
  }
};
