<div align="center">
  <a href="https://twoofwn.github.io/BeeQuiz/">
    <img src="assets/readme-banner.svg" alt="BeeQuiz — Pixel bee quiz app" width="100%" />
  </a>

  <h3>🐝 Học một chút, nhớ thật lâu.</h3>
  <p>Một góc ôn tập nhỏ xinh để biến những bộ câu hỏi JSON thành trải nghiệm luyện trắc nghiệm dễ dùng, dễ tìm và dễ chia sẻ.</p>

  <a href="https://twoofwn.github.io/BeeQuiz/"><img src="https://img.shields.io/badge/▶_TRẢI_NGHIỆM_BEEQUIZ-425B9A?style=for-the-badge&labelColor=425B9A&color=76C0EC" alt="Trải nghiệm BeeQuiz" /></a>
  <a href="https://github.com/twoofwn/BeeQuiz"><img src="https://img.shields.io/badge/GITHUB-SOURCE_CODE-425B9A?style=for-the-badge&labelColor=425B9A&color=FF95A5" alt="GitHub repository" /></a>
  <p><strong>🌐 Website:</strong> <a href="https://twoofwn.github.io/BeeQuiz/">https://twoofwn.github.io/BeeQuiz/</a></p>
</div>

✨ BeeQuiz có gì?
Tính năng	Mô tả
📚 Thư viện bộ đề	Tìm kiếm và chọn môn học từ dropdown; không cần tải JSON lên bằng tay.
🔀 Trộn thẻ	Đảo thứ tự câu hỏi và đáp án để mỗi lượt ôn tập bớt nhàm chán.
🎯 Làm bài & chấm điểm	Chọn đáp án, xem đúng/sai, theo dõi điểm số và tiến độ.
💡 Giải thích đáp án	Xem phần giải thích nếu bộ đề có cung cấp.
⭐ Đánh dấu câu hỏi	Lưu các câu muốn xem lại trong phiên sử dụng.
🔎 Tra cứu nhanh	Tìm theo nội dung câu hỏi/đáp án, lọc câu đã đánh dấu và phân trang.
📱 Responsive	Dùng được trên điện thoại lẫn máy tính.


Vào học ngay: Mở BeeQuiz →

🎨 Brand palette
<div align="center">
  <img src="https://img.shields.io/badge/Deep_Blue-%23425B9A-425B9A?style=for-the-badge&labelColor=425B9A" alt="Deep Blue #425B9A" />
  <img src="https://img.shields.io/badge/Sky_Blue-%2376C0EC-76C0EC?style=for-the-badge&labelColor=76C0EC" alt="Sky Blue #76C0EC" />
  <img src="https://img.shields.io/badge/Cream-%23FFF6DC-FFF6DC?style=for-the-badge&labelColor=FFF6DC" alt="Cream #FFF6DC" />
  <img src="https://img.shields.io/badge/Pink-%23FF95A5-FF95A5?style=for-the-badge&labelColor=FF95A5" alt="Pink #FF95A5" />
</div>

Giao diện lấy cảm hứng từ pixel art, với linh vật ong nhỏ và bốn màu nhận diện: #425B9A · #76C0EC · #FFF6DC · #FF95A5.
🚀 Cách sử dụng
1. Truy cập BeeQuiz.
2. Tìm tên hoặc mã môn trong dropdown bộ đề.
3. Chọn bộ đề, bắt đầu làm bài và xem giải thích sau khi trả lời.
4. Dùng Trộn thẻ để đổi thứ tự câu hỏi; đánh dấu các câu cần ôn lại.
5. Chuyển sang Tất cả câu hỏi để tìm kiếm, lọc và xem đáp án.
🧩 Thêm bộ đề mới
BeeQuiz là website tĩnh, không cần backend. Danh sách môn học được tạo tự động khi deploy thông qua GitHub Actions; trình duyệt tải danh mục và dữ liệu bằng JavaScript.

Đặt file .json vào thư mục data/ (có thể có thư mục con), sau đó commit và push lên nhánh main. Khi workflow deploy hoàn tất, bộ đề mới sẽ xuất hiện trong dropdown.

Ví dụ cấu trúc JSON:
{
  "name": "PRM393 - Flutter",
  "questionsList": [
    {
      "id": 1,
      "content": "Widget nào thường dùng để bố trí các phần tử theo chiều dọc?",
      "answersList": [
        { "id": 1, "content": "Column", "is_correct": true },
        { "id": 2, "content": "Row", "is_correct": false }
      ],
      "explanation": "Column sắp xếp các widget con theo trục dọc."
    }
  ]
}
Không cần sửa HTML để thêm môn. Lưu ý: GitHub Pages không tự liệt kê file trong thư mục; workflow tạo data/index.json từ các file JSON trong lúc build.

🛠️ Công nghệ
HTML5 · Tailwind CSS · JavaScript (Vanilla JS) · GitHub Pages · GitHub Actions
💻 Chạy ở máy cá nhân
Cần cài Node.js. Tại thư mục gốc dự án:
node scripts/generate-catalog.mjs
npx serve .
Mở địa chỉ local được in ra trên terminal. Không nên mở trực tiếp index.html qua file:// vì fetch() có thể bị trình duyệt chặn.
🤝 Đóng góp
Có bộ câu hỏi hay? Bạn có thể mở Pull Request để bổ sung JSON trong data/, báo lỗi hoặc đề xuất tính năng tại GitHub repository.
<div align="center">
  <strong>Made for curious minds, one quiz at a time.</strong><br/>
  <a href="https://twoofwn.github.io/BeeQuiz/">🐝 Bắt đầu ôn tập với BeeQuiz →</a>
</div>
