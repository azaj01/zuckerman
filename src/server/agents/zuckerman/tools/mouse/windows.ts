import { exec } from "node:child_process";
import { promisify } from "node:util";
import { writeFileSync, unlinkSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";
import type { MousePlatform } from "./platform.js";

const execAsync = promisify(exec);

/**
 * Check if Python is available and ctypes works
 */
async function ensurePythonAvailable(): Promise<string> {
  // Try python first, then python3
  const pythonCommands = ["python", "python3", "py"];
  
  for (const cmd of pythonCommands) {
    try {
      // Check if Python is available
      await execAsync(`${cmd} --version`);
      // Check if ctypes is available (should be in standard library)
      await execAsync(`${cmd} -c "import ctypes"`);
      return cmd;
    } catch {
      continue;
    }
  }
  
  throw new Error(
    "Python is required for mouse control on Windows.\n\n" +
    "Please install Python from: https://www.python.org/downloads/\n" +
    "Make sure to check 'Add Python to PATH' during installation."
  );
}

/**
 * Execute Python script for mouse control on Windows
 */
async function executePythonScript(code: string): Promise<void> {
  const pythonCmd = await ensurePythonAvailable();
  const tempFile = join(tmpdir(), `mouse_control_${Date.now()}_${Math.random().toString(36).substring(7)}.py`);
  try {
    writeFileSync(tempFile, code, "utf-8");
    await execAsync(`${pythonCmd} "${tempFile}"`);
  } catch (error: unknown) {
    const errorMessage = error instanceof Error ? error.message : String(error);
    if (errorMessage.includes("No module named") || errorMessage.includes("ImportError")) {
      throw new Error(
        `Python error: ${errorMessage}. ` +
        "Note: 'ctypes' should be part of Python standard library. " +
        "If you see this error, please check your Python installation."
      );
    }
    throw error;
  } finally {
    try {
      unlinkSync(tempFile);
    } catch {
      // Ignore cleanup errors
    }
  }
}

/**
 * Windows mouse control implementation using Windows API via ctypes
 */
export const windowsPlatform: MousePlatform = {
  async moveTo(x: number, y: number): Promise<void> {
    const pythonCode = `import ctypes
ctypes.windll.user32.SetCursorPos(${x}, ${y})`;
    await executePythonScript(pythonCode);
  },

  async getPosition(): Promise<{ x: number; y: number }> {
    const pythonCmd = await ensurePythonAvailable();
    const code = `import ctypes
class POINT(ctypes.Structure):
    _fields_ = [("x", ctypes.c_long), ("y", ctypes.c_long)]
point = POINT()
ctypes.windll.user32.GetCursorPos(ctypes.byref(point))
print(f"{point.x},{point.y}")`;
    const tempFile = join(tmpdir(), `mouse_pos_${Date.now()}_${Math.random().toString(36).substring(7)}.py`);
    try {
      writeFileSync(tempFile, code, "utf-8");
      const { stdout } = await execAsync(`${pythonCmd} "${tempFile}"`);
      const posParts = stdout.trim().split(",");
      return {
        x: parseInt(posParts[0].trim(), 10),
        y: parseInt(posParts[1].trim(), 10),
      };
    } catch (error: unknown) {
      const errorMessage = error instanceof Error ? error.message : String(error);
      if (errorMessage.includes("No module named") || errorMessage.includes("ImportError")) {
        throw new Error(
          `Python error: ${errorMessage}. ` +
          "Note: 'ctypes' should be part of Python standard library. " +
          "If you see this error, please check your Python installation."
        );
      }
      throw error;
    } finally {
      try {
        unlinkSync(tempFile);
      } catch {
        // Ignore cleanup errors
      }
    }
  },

  async click(x: number, y: number, button: "left" | "right" | "middle", clicks: number): Promise<void> {
    // Move to position first
    await this.moveTo(x, y);
    
    // Windows API constants
    const MOUSEEVENTF_LEFTDOWN = 0x0002;
    const MOUSEEVENTF_LEFTUP = 0x0004;
    const MOUSEEVENTF_RIGHTDOWN = 0x0008;
    const MOUSEEVENTF_RIGHTUP = 0x0010;
    const MOUSEEVENTF_MIDDLEDOWN = 0x0020;
    const MOUSEEVENTF_MIDDLEUP = 0x0040;
    
    let downFlag: number;
    let upFlag: number;
    
    if (button === "right") {
      downFlag = MOUSEEVENTF_RIGHTDOWN;
      upFlag = MOUSEEVENTF_RIGHTUP;
    } else if (button === "middle") {
      downFlag = MOUSEEVENTF_MIDDLEDOWN;
      upFlag = MOUSEEVENTF_MIDDLEUP;
    } else {
      downFlag = MOUSEEVENTF_LEFTDOWN;
      upFlag = MOUSEEVENTF_LEFTUP;
    }
    
    const clickCode = `import ctypes
import time
# Click
for _ in range(${clicks}):
    ctypes.windll.user32.mouse_event(${downFlag}, 0, 0, 0, 0)
    time.sleep(0.05)
    ctypes.windll.user32.mouse_event(${upFlag}, 0, 0, 0, 0)
    if ${clicks} > 1:
        time.sleep(0.1)`;
    await executePythonScript(clickCode);
  },

  async scroll(x: number, y: number): Promise<void> {
    const MOUSEEVENTF_WHEEL = 0x0800;
    const MOUSEEVENTF_HWHEEL = 0x1000;
    const WHEEL_DELTA = 120;
    
    const scrollCode = `import ctypes
import time
# Vertical scroll
if ${y} != 0:
    ctypes.windll.user32.mouse_event(${MOUSEEVENTF_WHEEL}, 0, 0, ${y > 0 ? WHEEL_DELTA : -WHEEL_DELTA} * abs(${y}), 0)
# Horizontal scroll
if ${x} != 0:
    ctypes.windll.user32.mouse_event(${MOUSEEVENTF_HWHEEL}, 0, 0, ${x > 0 ? WHEEL_DELTA : -WHEEL_DELTA} * abs(${x}), 0)`;
    await executePythonScript(scrollCode);
  },

  async drag(startX: number, startY: number, endX: number, endY: number, button: "left" | "right" | "middle", duration: number): Promise<void> {
    const MOUSEEVENTF_LEFTDOWN = 0x0002;
    const MOUSEEVENTF_LEFTUP = 0x0004;
    const MOUSEEVENTF_RIGHTDOWN = 0x0008;
    const MOUSEEVENTF_RIGHTUP = 0x0010;
    const MOUSEEVENTF_MIDDLEDOWN = 0x0020;
    const MOUSEEVENTF_MIDDLEUP = 0x0040;
    
    let downFlag: number;
    let upFlag: number;
    
    if (button === "right") {
      downFlag = MOUSEEVENTF_RIGHTDOWN;
      upFlag = MOUSEEVENTF_RIGHTUP;
    } else if (button === "middle") {
      downFlag = MOUSEEVENTF_MIDDLEDOWN;
      upFlag = MOUSEEVENTF_MIDDLEUP;
    } else {
      downFlag = MOUSEEVENTF_LEFTDOWN;
      upFlag = MOUSEEVENTF_LEFTUP;
    }
    
    const dragCode = `import ctypes
import time
# Move to start position
ctypes.windll.user32.SetCursorPos(${startX}, ${startY})
time.sleep(0.1)
# Press mouse button
ctypes.windll.user32.mouse_event(${downFlag}, 0, 0, 0, 0)
time.sleep(${duration})
# Move to end position while holding
ctypes.windll.user32.SetCursorPos(${endX}, ${endY})
time.sleep(0.05)
# Release mouse button
ctypes.windll.user32.mouse_event(${upFlag}, 0, 0, 0, 0)`;
    await executePythonScript(dragCode);
  },
};
