/**
 * Platform-specific mouse control interface
 */
export interface MousePlatform {
  /**
   * Move mouse to absolute position
   */
  moveTo(x: number, y: number): Promise<void>;

  /**
   * Get current mouse position
   */
  getPosition(): Promise<{ x: number; y: number }>;

  /**
   * Click at position
   */
  click(x: number, y: number, button: "left" | "right" | "middle", clicks: number): Promise<void>;

  /**
   * Scroll at current position
   */
  scroll(x: number, y: number): Promise<void>;

  /**
   * Drag from start to end position
   */
  drag(startX: number, startY: number, endX: number, endY: number, button: "left" | "right" | "middle", duration: number): Promise<void>;
}
