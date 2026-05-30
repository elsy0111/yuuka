export interface ChatMessage {
  text: string;
  imageData?: {
    data: string;
    mimeType: string;
  };
}
