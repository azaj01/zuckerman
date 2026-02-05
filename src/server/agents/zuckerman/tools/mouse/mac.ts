import { exec } from "node:child_process";
import { promisify } from "node:util";
import type { MousePlatform } from "./platform.js";

const execAsync = promisify(exec);

/**
 * Check and install Python dependencies if needed
 */
async function ensurePythonDependencies(): Promise<void> {
  const pythonCmd = "python3";
  
  try {
    // Check if pyobjc is installed
    await execAsync(`${pythonCmd} -c "import Quartz"`);
    // pyobjc is available
    return;
  } catch {
    // pyobjc is not installed, try to install it
    console.log("pyobjc not found, attempting to install via pip...");
    
    try {
      // Try to install pyobjc
      console.log("Installing pyobjc with: pip3 install pyobjc");
      await execAsync(`${pythonCmd} -m pip install pyobjc`);
      
      // Verify installation
      await execAsync(`${pythonCmd} -c "import Quartz"`);
      console.log("pyobjc installed successfully!");
      return;
    } catch (installError) {
      const errorMsg = installError instanceof Error ? installError.message : String(installError);
      
      if (errorMsg.includes("pip") || errorMsg.includes("No module named pip")) {
        throw new Error(
          "Python package 'pyobjc' is required for mouse control on macOS.\n\n" +
          "Installation failed. Please install it manually:\n" +
          "  pip3 install pyobjc\n\n" +
          "If pip is not available, install Python with pip first.\n" +
          `Error: ${errorMsg}`
        );
      } else {
        throw new Error(
          "Failed to install pyobjc automatically.\n\n" +
          "Please install it manually:\n" +
          "  pip3 install pyobjc\n\n" +
          `Error: ${errorMsg}`
        );
      }
    }
  }
}

/**
 * Execute Python script for mouse control
 */
async function executePythonScript(code: string): Promise<void> {
  await ensurePythonDependencies();
  const pythonCmd = "python3";
  await execAsync(`${pythonCmd} -c "${code.replace(/"/g, '\\"')}"`);
}

/**
 * macOS mouse control implementation using Python with pyobjc
 * Automatically installs pyobjc if missing
 */
export const macPlatform: MousePlatform = {
  async moveTo(x: number, y: number): Promise<void> {
    const code = `import Quartz; Quartz.CGWarpMouseCursorPosition(Quartz.CGPoint(x=${x}, y=${y}))`;
    await executePythonScript(code);
  },

  async getPosition(): Promise<{ x: number; y: number }> {
    // Use AppleScript for getting position (more reliable)
    const getPosScript = `tell application "System Events"
  set currentPos to mousePosition
  return (item 1 of currentPos) & "," & (item 2 of currentPos)
end tell`;
    const { stdout } = await execAsync(`osascript -e '${getPosScript}'`);
    const posParts = stdout.trim().split(",");
    return {
      x: parseInt(posParts[0].trim(), 10),
      y: parseInt(posParts[1].trim(), 10),
    };
  },

  async click(x: number, y: number, button: "left" | "right" | "middle", clicks: number): Promise<void> {
    // Move to position first
    await this.moveTo(x, y);
    await new Promise(resolve => setTimeout(resolve, 50));
    
    // Perform click using AppleScript (more reliable for clicks)
    if (button === "right") {
      if (clicks === 2) {
        const script = `tell application "System Events"
  right click at {${x}, ${y}}
  delay 0.1
  right click at {${x}, ${y}}
end tell`;
        await execAsync(`osascript -e '${script}'`);
      } else {
        const script = `tell application "System Events"
  right click at {${x}, ${y}}
end tell`;
        await execAsync(`osascript -e '${script}'`);
      }
    } else if (button === "middle") {
      // Middle click using Python/CGEvent
      const code = `import Quartz; import time; Quartz.CGWarpMouseCursorPosition(Quartz.CGPoint(x=${x}, y=${y})); time.sleep(0.1); event = Quartz.CGEventCreateMouseEvent(None, Quartz.kCGEventOtherMouseDown, (${x}, ${y}), Quartz.kCGMouseButtonCenter); Quartz.CGEventPost(Quartz.kCGHIDEventTap, event); time.sleep(0.05); event = Quartz.CGEventCreateMouseEvent(None, Quartz.kCGEventOtherMouseUp, (${x}, ${y}), Quartz.kCGMouseButtonCenter); Quartz.CGEventPost(Quartz.kCGHIDEventTap, event)`;
      if (clicks === 2) {
        await executePythonScript(code);
        await new Promise(resolve => setTimeout(resolve, 100));
        await executePythonScript(code);
      } else {
        await executePythonScript(code);
      }
    } else {
      // Left click
      if (clicks === 2) {
        const script = `tell application "System Events"
  double click at {${x}, ${y}}
end tell`;
        await execAsync(`osascript -e '${script}'`);
      } else {
        const script = `tell application "System Events"
  click at {${x}, ${y}}
end tell`;
        await execAsync(`osascript -e '${script}'`);
      }
    }
  },

  async scroll(x: number, y: number): Promise<void> {
    const code = `import Quartz; x=${x}; y=${y}; event = Quartz.CGEventCreateScrollWheelEvent(None, Quartz.kCGScrollEventUnitLine, 1, int(y), 0) if y != 0 else None; Quartz.CGEventPost(Quartz.kCGHIDEventTap, event) if event else None; event = Quartz.CGEventCreateScrollWheelEvent(None, Quartz.kCGScrollEventUnitLine, 2, 0, int(x)) if x != 0 else None; Quartz.CGEventPost(Quartz.kCGHIDEventTap, event) if event else None`;
    await executePythonScript(code);
  },

  async drag(startX: number, startY: number, endX: number, endY: number, button: "left" | "right" | "middle", duration: number): Promise<void> {
    const buttonType = button === "right" ? "Quartz.kCGMouseButtonRight" : button === "middle" ? "Quartz.kCGMouseButtonCenter" : "Quartz.kCGMouseButtonLeft";
    
    const code = `import Quartz; import time; Quartz.CGWarpMouseCursorPosition(Quartz.CGPoint(x=${startX}, y=${startY})); time.sleep(0.1); button = ${buttonType}; event = Quartz.CGEventCreateMouseEvent(None, Quartz.kCGEventLeftMouseDown if button == Quartz.kCGMouseButtonLeft else Quartz.kCGEventRightMouseDown if button == Quartz.kCGMouseButtonRight else Quartz.kCGEventOtherMouseDown, (${startX}, ${startY}), button); Quartz.CGEventPost(Quartz.kCGHIDEventTap, event); time.sleep(${duration}); Quartz.CGWarpMouseCursorPosition(Quartz.CGPoint(x=${endX}, y=${endY})); time.sleep(0.05); event = Quartz.CGEventCreateMouseEvent(None, Quartz.kCGEventLeftMouseUp if button == Quartz.kCGMouseButtonLeft else Quartz.kCGEventRightMouseUp if button == Quartz.kCGMouseButtonRight else Quartz.kCGEventOtherMouseUp, (${endX}, ${endY}), button); Quartz.CGEventPost(Quartz.kCGHIDEventTap, event)`;
    await executePythonScript(code);
  },
};
