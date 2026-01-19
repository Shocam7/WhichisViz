export type VisualizationType = "3D" | "2D";

export interface VisualizationResponse {
  type: VisualizationType;
  script: string;
  reasoning?: string;
}

export interface LogEntry {
  id: string;
  timestamp: number;
  message: string;
  type: "info" | "error" | "success";
}

export interface OCRBlock {
  text: string;
  bbox: {
    x0: number;
    y0: number;
    x1: number;
    y1: number;
  };
}
