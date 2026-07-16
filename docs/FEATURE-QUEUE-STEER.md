# Queue + Steal

Policy xử lý tin nhắn khi **agent đang chạy**. Tính năng này giúp người dùng nhập follow-up ngay trong lúc turn hiện tại chưa xong mà không tạo hai `agent:prompt` chạy song song.

## Status

- Status: shipped in `v0.1.6`.
- Default: queue enabled.
- Scope: renderer-side queue per tab/project, with safe drain after turn completion.

## Behavior

| Trạng thái | Gửi tin mới |
|------------|-------------|
| Idle | Chạy turn ngay (`agent:prompt`) |
| Busy trên tab hiện tại + queue bật | Enqueue, hiện pill hàng đợi, auto-run FIFO sau khi turn xong |
| Busy trên tab hiện tại + queue tắt | Steal: cancel turn hiện tại rồi chạy prompt mới |
| Busy tab/project khác | Chặn và hiện banner vì app vẫn single-flight |

## UI

- Queue pill phía trên composer.
- Pill có text, badge “Chỉ dẫn”, nút gửi ngay/steal, xóa, và menu `...`.
- Menu hỗ trợ chỉnh sửa tin nhắn, gửi ngay, hoặc tắt hàng đợi.
- Placeholder khi busy: “Yêu cầu thay đổi tiếp theo…”.
- Settings → Quyền: **Hàng đợi tin nhắn (queue)** (`messageQueueEnabled`).

## Runtime Policy

1. Không gọi `agent:prompt` khi `busy === true`.
2. FIFO drain chỉ chạy sau `finishTurn` bình thường.
3. User Stop hoặc đóng tab không tự drain queue.
4. Steal chỉ chạy khi `stealPayloadRef` đã set và `cancelBusyTurn` hoàn tất.
5. Queue gắn với `tabId` + `projectPath`; pill chỉ hiện ở tab sở hữu item.

## Clear Rules

| Sự kiện | Queue | Auto-run |
|---------|-------|----------|
| Turn xong | Giữ item còn lại | FIFO drain |
| Dừng turn | Giữ pill | Không drain |
| Steal | Bỏ item được steal | Chạy payload steal |
| Stop Agent / agent exit | Xóa hết | Không |
| Đóng tab | Xóa item của tab đó | Không |
| Gỡ project | Xóa item của project đó | Không |

## Files

- `src/App.tsx`: state, policy, drain, queue UI.
- `src/styles.css`: `.prompt-queue`, `.queue-pill`, menu, light/dark states.
- `electron/settings.cjs`: `messageQueueEnabled` default.
- `src/vite-env.d.ts`: settings/type surface.
- `src/i18n.ts`: queue labels.

## Later

- Drag/drop reorder queue.
- Persist queue through app restart.
- Native mid-turn steer if Grok ACP exposes a safe method.
- Full i18n cleanup for remaining hardcoded Vietnamese labels.