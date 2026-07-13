# Setup đồng bộ giá SJC trên điện thoại Android (Termux)

Bối cảnh: xem `docs/sync-vn-gold-setup.md` — cùng mục đích (chạy
`scripts/sync-vn-gold.ts` từ IP nhà/di động, vì GitHub Actions bị chặn),
chỉ khác nền tảng. Máy Android chạy `cronie` thay Task Scheduler.

## 0. Cài Termux (không dùng Play Store)

Bản Termux trên Play Store đã ngừng cập nhật, hay lỗi. Cài từ
**F-Droid**: https://f-droid.org/packages/com.termux/ → tải F-Droid app
→ tìm Termux → cài. Cài kèm **Termux:Boot** (cùng tác giả, cùng
F-Droid) để tự khởi động cron sau khi khởi động lại máy/mất điện.

## 1. Cài gói cần thiết

Mở Termux:

```
pkg update && pkg upgrade
pkg install nodejs git openssh cronie termux-services
```

Cho phép Termux truy cập bộ nhớ (chỉ cần nếu muốn xem log ở app khác):

```
termux-setup-storage
```

## 2. Clone + cài đặt

```
git clone https://github.com/hnb-rabear/auvn.git
cd auvn
npm ci
```

## 3. Personal Access Token riêng cho máy này

Giống bước 2 trong `sync-vn-gold-setup.md`:
GitHub → Settings → Developer settings → Fine-grained tokens → Generate
new token.
- Repository access: chỉ chọn repo `auvn`.
- Permissions: **Contents: Read and write**.
- Đặt tên rõ (vd `auvn-sync-android`) — mất máy thì revoke đúng token.

Lần đầu `git push`/`git pull` sẽ hỏi username/password — dùng token
làm password. Để khỏi phải nhập lại mỗi lần, cấu hình credential cache:

```
git config --global credential.helper 'cache --timeout=31536000'
```

(hoặc dùng URL kèm token: `git remote set-url origin
https://<token>@github.com/hnb-rabear/auvn.git` — chấp nhận đánh đổi
token nằm trong `.git/config`, chỉ làm nếu máy này là máy riêng.)

## 4. Giữ Termux sống nền (quan trọng nhất — hay bị Android kill)

Android mặc định diệt tiến trình nền để tiết kiệm pin, cron sẽ không
chạy đúng giờ nếu bị diệt. Bắt buộc làm cả 3:

1. **Tắt tối ưu pin cho Termux**: Cài đặt → Ứng dụng → Termux → Pin →
   chọn "Không giới hạn" / "Không tối ưu hoá" (tên tuỳ hãng máy —
   Xiaomi/Oppo/Samsung mỗi hãng gọi khác nhau, tìm mục pin của app).
2. **Termux:Boot**: mở app Termux:Boot một lần sau khi cài (để Android
   cấp quyền tự khởi động), tạo file
   `~/.termux/boot/start-cron.sh`:

   ```
   mkdir -p ~/.termux/boot
   cat > ~/.termux/boot/start-cron.sh << 'EOF'
   #!/data/data/com.termux/files/usr/bin/sh
   crond
   EOF
   chmod +x ~/.termux/boot/start-cron.sh
   ```

3. **termux-wake-lock** khi cần chắc chắn máy không ngủ sâu (tuỳ chọn,
   tốn pin hơn): chạy `termux-wake-lock` một lần trong phiên Termux
   đang mở, hoặc gọi trong script cron trước khi fetch.

## 5. Tạo cron (2 lần/ngày: 9h + 13h30)

```
crond
crontab -e
```

Thêm 2 dòng (phút giờ ngày tháng thứ — giờ hệ thống điện thoại, chỉnh
đúng múi giờ VN trước):

```
0 9 * * * cd ~/auvn && npx tsx scripts/sync-vn-gold.ts >> ~/auvn/scripts/sync-vn-gold.log 2>&1
30 13 * * * cd ~/auvn && npx tsx scripts/sync-vn-gold.ts >> ~/auvn/scripts/sync-vn-gold.log 2>&1
```

Lưu (`:wq` nếu `vi`, hoặc theo editor mặc định của crontab -e).

Kiểm tra cron đã có:

```
crontab -l
```

## 6. Test tay 1 lần

```
cd ~/auvn
npx tsx scripts/sync-vn-gold.ts
```

Kỳ vọng giống Windows: fetch/rebase OK, backfill chạy, "không có gì
mới để commit" hoặc commit+push thành công.

## Lưu ý

- Không cần mở app Termux mọi lúc — cron/Boot tự chạy nền, chỉ cần máy
  bật + có mạng (wifi hoặc data) lúc 9h/13h30.
- Máy tắt nguồn/hết pin đúng giờ đó thì hôm sau tự lấp bù (backfill
  idempotent, không mất dữ liệu).
- Nếu sau vài ngày thấy cron không chạy (không có log mới) — nghi ngờ
  đầu tiên là Android đã tối ưu pin lại (một số hãng tự bật lại sau
  update) hoặc Termux bị đóng hoàn toàn (swipe kill từ recent apps) —
  kiểm tra lại bước 4.
- Lỗi "fetch/rebase thất bại" — không tự ý xử lý theirs/ours, mở log
  (`scripts/sync-vn-gold.log`) xem chi tiết, xử lý tay.
