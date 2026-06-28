// main.ts - Thin entry point for the NCAA School Find game
//
// Registers a single DOMContentLoaded listener that calls initApp()
// to set up all DOM event handlers and initialize the game UI.
// All wiring logic lives in src/init.ts.

import { initApp } from "./init";

//============================================
// Entry point

document.addEventListener("DOMContentLoaded", () => initApp());
