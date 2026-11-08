# SLP の構成と描画の保守

2026-09-25に提供された公開版（作業開始時の Git HEAD: `b26a8d4`）を基準に整理。
ブラウザ用の通常のJavaScriptを機能別に分割している。ビルド、フレームワーク、npm依存は不要。
自動解法の探索手順・パリティー対応は今回変更していない。

## JavaScript の担当

| ファイル | 担当 |
| --- | --- |
| `js/state.js` | 盤面、サイズ、操作中の状態、タイマーなどの共有変数 |
| `js/main.js` | DOM構築後の初期化とService Worker登録 |
| `js/game/board.js` | 盤面初期化、ターゲット、モード変更、移動、完成判定 |
| `js/game/session.js` | タイマー、手数、操作ログ、記録スイッチ |
| `js/game/gimmicks.js` | 回転、フラッシュ、サーチライト、効果音 |
| `js/input/drag.js` | ドラッグ・長押し・枠移動の判断と操作確定 |
| `js/input/events.js` | キーボード、マウス、タッチのイベント接続 |
| `js/ui/board.js` | 盤面・ターゲット・座標の描画、寸法計算、表示制御 |
| `js/ui/ghosts.js` | ドラッグとリプレイで共通のゴースト生成・削除・移動単位 |
| `js/media/media.js` | 画像・動画の読込、Canvas描画ループ、メディアパネル |
| `js/media/rotation.js` | セルの向きに応じた画像描画 |
| `js/history/store.js` | 履歴保存・削除、CPU解法の記録、旧履歴の修復 |
| `js/history/ui.js` | 履歴一覧、ミニプレビュー、履歴選択 |
| `js/history/import-export.js` | インポート・バックアップ・復元・手順反転 |
| `js/replay/moves.js` | 手順文字列の解釈、FRAMEへの集約、手順実行 |
| `js/replay/replay.js` | リプレイ開始・前後移動・アニメーション・表示更新 |
| `js/replay/playback.js` | Ctrl押下中の一時的な前後移動と状態復元 |
| `js/solver/search.js` | 移動モデル、ヒューリスティック、A*・双方向BFS |
| `js/solver/greedy.js` | 既存の段階的な自動解法 |
| `js/solver/controller.js` | 解法の選択、進捗表示、探索の呼び出し |

`index.html` の読み込み順を維持する。共有状態を最初に定義し、各機能の定義後に `main.js` が入力イベントを接続する。
HTMLの `onclick` / `onchange` と既存の関数名は維持している。グローバル共有をES Modulesへ変更する場合は、HTMLからの呼び出しと `let` / `window` の違いも同時に扱うこと。

重複した `createMiniPreview`、`resetToColorMode`、`handleVideoUpload`、`stopContinuousStep` は、公開版で最終的に有効だった実装に統一した。
ファイル入力の `onchange` と `addEventListener` の二重登録、セルの二重 `mousedown` 登録も解消した。
参照のなかった旧関数は除去している。コンソールからの独自呼び出しに使っていた場合は基準版の履歴から確認できる。

## CSS の適用順

1. `base-theme.css`: 基本色、文字、キー表示、状態付きボタン
2. `board-layout.css`: 盤面・座標・サイドパネル・サイズとスマホレイアウト
3. `ghosts.css`: ゴーストの絶対配置とリプレイ用transition
4. `gimmick-effects.css`: 発光、回転、暗幕、完成表示
5. `ui-components.css`: メニュー、履歴、メディア、リプレイの装飾と最終上書き

公開版の4ファイルの前後関係を維持し、競合しない `.ghost-strip` の規則だけ専用ファイルへ移した。
同じ条件・同じセレクターで後続宣言に確実に上書きされる37宣言を除去した。異なるセレクター間の重複に見える指定や `!important` は、一律には削除していない。

スマホ用 `@media` を安易に最後へ集めない。公開版では `board-layout.css` の768px以下の規則の後に、`ui-components.css` の規則が適用される。
JavaScriptの寸法計算の境界は600pxで、CSSの境界と同一ではない。
HTMLのインライン指定とJavaScriptによる幅・高さ・display等の動的指定も残している。CSSだけを見て不要と判断しないこと。

## ゴーストの座標・寸法の契約

```text
.board-wrapper                 外側の余白・枠・クリッピング
└─ #board.grid-container        position:relative / overflow:hidden
   ├─ .face > .cell             本物の盤面セル
   └─ .ghost-strip              position:absolute / pointer-events:none
      ├─ 1周目（前方の複製）
      ├─ 2周目（本来の表示位置）
      └─ 3周目（後方の複製）
```

- 座標原点は `#board`。`board-wrapper` のpaddingを計算に足さない。
- 初期位置は最初のセルの `getBoundingClientRect()` から盤面のrectを引く。
- 複製の周期は「盤面の幅または高さ + GAP_FACE」。最初に1周期分だけ負方向へ置く。
- 面内は `GAP_CELL`、面の境界は追加margin `GAP_FACE - GAP_CELL`、3セットの間は `GAP_FACE`。
- 1ブロックの移動単位は `cellSizePixel * subSize + GAP_CELL * (subSize - 1) + GAP_FACE`。`GhostLayer.slideUnit()` が一元管理する。
- CSSの `position`、`overflow`、`gap`、`box-sizing` を変えると座標・切り抜き・ループの継ぎ目に影響する。

`GhostLayer.createLines()` は `#board > .face > .cell` だけを一度取得し、生成済みのゴーストを再び複製対象にしない。
`cloneNode()` ではCanvasの画素はコピーされないため、画像・動画セルは `toDataURL()` でその瞬間の見た目を固定する。
セルの回転や数字ラベルは、描画済みセルの複製として引き継がれる。

ドラッグでは本物のセルをopacity 0.2、リプレイでは0.1にする。ゴーストは1。
ドラッグ終了時は `resetDragState()` が所有するゴーストを削除して再描画する。
リプレイは `try/finally` で削除・再描画・`isAnimating`解除を行い、手順実行が失敗してもゴーストや操作ロックを残さない。
生成途中の例外では、それまで作ったゴーストとセルのopacityを巻き戻す。

## 起動・検証

プロジェクトのディレクトリで実行する。

```powershell
node tools/serve.js
node --test tests/logic.test.js
```

ローカルプレビュー: `http://127.0.0.1:8012/`。Node.jsはこのサーバーとテストにのみ必要で、配信後のゲーム本体には不要。
`.cjs` はCommonJS形式を明示するNode.js用JavaScript拡張子。今回プロジェクトに残す補助プログラムは `tools/` と `tests/` に置いた通常の `.js` で、ゲームのHTMLからは読み込まれない。

公開版のコピーを別ディレクトリに用意すればブラウザ比較も実行できる。

```powershell
node tools/serve.js --baseline "公開版を保存したディレクトリの絶対パス"
```

`http://127.0.0.1:8012/tests/browser-regression.html` の実行ボタンを押す。
比較モードではService Workerによるキャッシュ介入を無効にし、テストフレームの履歴ストレージをメモリ内に分離する。
幅1200px・390px、全5モードについて主要要素とゴーストの計算済みCSS・矩形を比較する。Canvas複製、タッチ長押し、操作後の盤面、例外時の後片付けも確認する。
実機のiOS/Safari、実動画のデコード・音声、全スクランブルに対する解法完走を保証するテストではない。

### 今回の検証結果

- ブラウザ比較: 150状態の計算済みCSS・矩形が公開版と一致。
- タッチの通常／長押し枠移動×縦横4ケース、およびリプレイ例外時の後片付け: 合格。合計155チェック。
- Node.jsのロジック・読込・履歴・PWA資産テスト: 当時14件。現行の `tests/logic.test.js` は57件。
- 公開版とのJavaScript構文木比較: 有効な関数・クラス117件の実装が一致。変更はゴースト共通化、イベント二重登録解消、重複処理の委譲と初期化の集約。この一致は整理時点の記録であり、その後の整合修正は含まない。
- 整理後の通常ゲーム画面を目視確認し、起動時のブラウザエラーなし。

## PWA と今後の課題

`sw.js` のASSETSとHTMLの読み込みURLを一致させた。ファイルを増やすときは両方更新し、配信時にCACHE_NAMEも更新する。
キャッシュ削除対象は `slp-cache-` で始まる旧キャッシュに限定する。
旧Service Workerで開いているページは更新が入るまで旧HTMLを返す場合があるため、更新完了後に再読み込みして確認する。

今回は構成整理と描画処理の重複解消が対象。公開版から引き継いで直した箇所は次のとおり。

- Easy（`2-4`）の双方向BFSは `solveBidirectional` を呼び、結果を `path` に受ける。
- プレイタイマーは `timerId` を見る。解法開始時に停止できる。
- 回転間隔は `rotateTimerId` に一本化した。盤面回転のたびに間隔を消す処理はなく、カウントは周回する。
- 寸法上限 `maxCell` は `calculateLayout` の局所変数。未使用の `lveHistory` 代入は外した。
- 画像回転は `window.rotationManager` だけを作る。
- 手数表示は初期値と同じ4桁。枠移動の長押しは `LONG_PRESS_MS`（250ms）。リプレイ連続送りは別定数の300ms。
- 履歴修復の関数名は `restorationBoard`。状態メッセージは `addLog`。完成時の履歴更新は `saveSystemLog` が `refreshHistoryList` を呼ぶ。
- 画面タイトル、README、ReadMe、Service Worker の版は 2.3.2。Ctrl は手順ボタンの表示で、操作説明もそれに合わせた。

残っている判断事項は次のとおり。

- 2×4系のパリティー／最終段の処理。
- インラインスタイル、セレクターの `onclick` 依存、ファイル間の共有状態。段階的に改善する際も比較テストを通すこと。

## 完成判定の回帰確認

記録を有効にしてタイマーを開始したら、`toggleTimer` が `isReplayMode` を解除します。履歴解析のフラグが残ると、タイマーだけ動作して `checkComplete` が早期終了するためです。記録無効の解析中は従来どおり完成判定を抑止します。

`node --test tests/logic.test.js` で通常プレイ・Replay後・記録無効時を検証します。ローカルサーバーで `tests/completion.html` を開き、Run completion tests を押すと、全5モードの通常時／Replay後についてドラッグで完成させ、表示・タイマー停止・履歴保存・ゴースト消去を確認できます。テストの履歴はメモリー内に隔離します。
