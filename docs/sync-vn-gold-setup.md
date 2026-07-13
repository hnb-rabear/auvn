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

## 3. Tạo Task Scheduler (chạy 2 lần/ngày, không cần mở project)

Đổi `C:\đường-dẫn\auvn` thành nơi vừa clone. Tạo 2 task riêng (9h + 13h30) —
`schtasks /create` chỉ nhận 1 giờ mỗi lệnh:

```
schtasks /create /tn "AuVn-SyncVnGold-9h" /tr "C:\đường-dẫn\auvn\scripts\sync-vn-gold.cmd" /sc daily /st 09:00 /rl limited /f
schtasks /create /tn "AuVn-SyncVnGold-1330" /tr "C:\đường-dẫn\auvn\scripts\sync-vn-gold.cmd" /sc daily /st 13:30 /rl limited /f
```

Kiểm tra:

```
schtasks /query /tn "AuVn-SyncVnGold-9h" /fo list /v
schtasks /query /tn "AuVn-SyncVnGold-1330" /fo list /v
```

Máy đã setup task cũ `AuVn-SyncVnGold` (1 lần/ngày, 08:00) — xoá trước khi tạo
2 task mới, tránh chạy trùng:

```
schtasks /delete /tn "AuVn-SyncVnGold" /f
```

## 4. Test tay 1 lần

```
npx tsx scripts\sync-vn-gold.ts
```

Kỳ vọng: fetch/rebase OK, backfill chạy, "không có gì mới để commit" (nếu máy 1
đã đồng bộ đủ) hoặc commit+push thành công.

## Lưu ý

- Không cần mở project/VSCode — Task Scheduler tự chạy nền, chỉ cần máy bật + có mạng lúc 9h/13h30.
- Máy tắt đúng giờ đó thì hôm sau tự lấp bù (backfill idempotent, không mất dữ liệu).
- Nếu script báo lỗi "fetch/rebase thất bại" — không tự ý xử lý theirs/ours, mở
  log (`sync-vn-gold.log` cạnh script) xem chi tiết, xử lý tay.
