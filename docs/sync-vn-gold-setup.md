# Setup đồng bộ giá SJC trên thiết bị thứ 2 (Windows PC)

Bối cảnh: GitHub Actions runner (IP datacenter) bị chặn ở cả 3 nguồn giá SJC
(BTMC/sjc.com.vn/cafef) — xem CLAUDE.md "Data sources". `scripts/sync-vn-gold.ts`
chạy từ IP nhà, tự lấp gap qua `backfill-vn.ts`, commit + push. Máy 1 đã setup
xong; đây là bước cho máy 2.

## 1. Clone + cài đặt

```
git clone https://github.com/hnb-rabear/auvn.git
cd auvn
npm ci
```

## 2. Tạo Personal Access Token riêng cho máy này

GitHub → Settings → Developer settings → Fine-grained tokens → Generate new token.
- Repository access: chỉ chọn repo `auvn`.
- Permissions: **Contents: Read and write**.
- Đặt tên rõ để phân biệt (vd `auvn-sync-pc2`) — máy nào mất/nghi ngờ thì revoke
  đúng token đó, không ảnh hưởng máy khác.

Lần đầu `git push`/`git pull`, Git Credential Manager sẽ hỏi đăng nhập — dùng
token này làm password (không dùng mật khẩu GitHub thật).

## 3. Tạo Task Scheduler (chạy hằng ngày, không cần mở project)

Đổi `C:\đường-dẫn\auvn` thành nơi vừa clone:

```
schtasks /create /tn "AuVn-SyncVnGold" /tr "C:\đường-dẫn\auvn\scripts\sync-vn-gold.cmd" /sc daily /st 08:00 /rl limited /f
```

Kiểm tra:

```
schtasks /query /tn "AuVn-SyncVnGold" /fo list /v
```

## 4. Test tay 1 lần

```
npx tsx scripts\sync-vn-gold.ts
```

Kỳ vọng: fetch/rebase OK, backfill chạy, "không có gì mới để commit" (nếu máy 1
đã đồng bộ đủ) hoặc commit+push thành công.

## Lưu ý

- Không cần mở project/VSCode — Task Scheduler tự chạy nền, chỉ cần máy bật + có mạng lúc 8h.
- Máy tắt đúng giờ đó thì hôm sau tự lấp bù (backfill idempotent, không mất dữ liệu).
- Nếu script báo lỗi "fetch/rebase thất bại" — không tự ý xử lý theirs/ours, mở
  log (`sync-vn-gold.log` cạnh script) xem chi tiết, xử lý tay.
