export interface ImageData {
  data: string;
  mimeType: string;
}

export interface ChatMessage {
  text: string;
  imageData?: ImageData;
  imagesData?: ImageData[];
}
