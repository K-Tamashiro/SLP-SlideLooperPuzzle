<h1 align="center">SLP - Slide Looper Puzzle</h1>

<p align="center">
  <b>ZebraSoft - Version 2.3.2</b><br>
  <br>
  <b>🔴 Demo / PWA <a href="https://k-tamashiro.github.io/SLP-SlideLooperPuzzle/">https://k-tamashiro.github.io/SLP-SlideLooperPuzzle/</a></b>
  <br><br>
  <img src="https://img.shields.io/badge/Version-2.3.2-blue?style=flat-square" alt="Version">
  <img src="https://img.shields.io/badge/Brand-ZebraSoft-black?style=flat-square" alt="Brand">
  <img src="https://img.shields.io/badge/Author-Tamayan-green?style=flat-square" alt="Author">
</p>

<br>

### 🧩 ゲーム概要
**SLP (Slide Looper Puzzle)** は、行や列をスライドさせてターゲットとなるパターンを再構築する論理パズルゲームです。スピードキューブのような連動性と、トーラス構造のスライディングパズルの戦略性を併せ持っています。

### 🎮 遊び方
* **基本操作**: 行または列をマウスドラッグやスワイプでブロック単位にスライドします。
* **枠移動操作**: PCでは **Shift + ドラッグ**、スマートフォンでは **長押し** で枠単位の移動が可能です。
* **手順送り (PC)**: **Ctrl** を押している間、前後の手順ボタンを表示します。
* **クリア条件**: 盤面を画面右側の **"TARGET VIEW"** と同じ配置に揃えるとクリアとなります。

### 🚀 ゲームギミック
* **Auto-Rotation**: 一定時間ごとに盤面全体が90°回転します。
* **Searchlight**: ボタンを押すたびに覗き穴が OFF / S / M / L と切り替わります。タイマー動作中はポインタに追従します。
* **Flash**: セルをクリックすると、同色のセルが一時的に発光します。

### 💻 動作環境
* **OS**: Windows / macOS / Linux
* **対応ブラウザ**: Google Chrome / Edge / Firefox (HTML5対応ブラウザ)

### 開発・メンテナンス

ソース構成、CSSの適用順、ゴーストの座標と後片付け、検証方法は [保守ガイド](docs/architecture.md) を参照してください。
ローカル起動は `node tools/serve.js`、ロジックテストは `node --test tests/logic.test.js` です。ゲーム本体のビルドは不要です。

---

### 🧩 Overview
**SLP (Slide Looper Puzzle)** is a logic puzzle game where you reconstruct a target pattern by sliding rows and columns. It combines the mechanics of speedcubing with the strategic depth of torus-structured sliding puzzles.

### 🎮 How to Play
* **Basic Controls**: Slide rows or columns by block units via dragging or swiping.
* **Frame Controls**: Move by frame units using **Shift + Drag** on PC or **Long Press** on smartphones.
* **Step Controls (PC)**: Hold **Ctrl** to show the previous and next step buttons.
* **Clear Condition**: The game is cleared when your board matches the configuration shown in the **"TARGET VIEW"** on the right side of the screen.

### 🚀 Game Gimmicks
* **Auto-Rotation**: The entire board rotates 90° at regular intervals.
* **Searchlight**: Each press cycles the peephole through OFF / S / M / L. While the timer is running, the hole follows the pointer.
* **Flash**: Clicking a cell causes all cells of the same color to flash briefly.

### 💻 System Requirements
* **OS**: Windows / macOS / Linux
* **Browsers**: Google Chrome / Edge / Firefox (HTML5 compatible)

<br>

## 📜 Credit / License
* **Planning & Development**: Tamayan / ZebraSoft
* Copyright (C) 2025 ZebraSoft All Rights Reserved.
