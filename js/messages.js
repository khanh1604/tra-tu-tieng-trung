/*
 * Thông điệp mỗi ngày cho từng từ. Mỗi ngày trang tự chọn một thông điệp (đổi lúc 0h theo giờ máy người xem).
 *   zh = câu tiếng Trung, py = pinyin, vi = thông điệp tiếng Việt
 * Từ nào không có ở đây thì trang tự tạo thông điệp từ câu ví dụ và mẹo nhớ chữ.
 */
window.MESSAGES = {
  '福': [
    { zh: '福如东海', py: 'fú rú dōng hǎi', vi: 'Phúc như Đông Hải: chúc phúc của bạn rộng như biển lớn. Hôm nay hãy gửi lời chúc này tới một người thân.' },
    { zh: '五福临门', py: 'wǔ fú lín mén', vi: 'Ngũ phúc lâm môn: năm điều phúc (sống lâu, giàu có, bình an, đức tốt, ra đi thanh thản) cùng đến nhà.' },
    { zh: '平安是福', py: 'píng\'ān shì fú', vi: 'Bình an chính là phúc. Một ngày trôi qua yên ổn cũng là một món quà.' },
    { zh: '知足常乐', py: 'zhī zú cháng lè', vi: 'Biết đủ thì luôn vui. Hôm nay hãy kể ra 3 điều bạn đang biết ơn.' },
    { zh: '福星高照', py: 'fú xīng gāo zhào', vi: 'Sao Phúc chiếu rọi: chúc bạn hôm nay gặp nhiều may mắn.' },
    { zh: '有福同享', py: 'yǒu fú tóng xiǎng', vi: 'Có phúc cùng hưởng. Niềm vui chia sẻ sẽ được nhân đôi.' },
    { zh: '健康就是福', py: 'jiànkāng jiù shì fú', vi: 'Khỏe mạnh chính là phúc. Hôm nay nhớ uống đủ nước và đi bộ một chút nhé.' },
    { zh: '惜福', py: 'xī fú', vi: 'Tiếc phúc: trân trọng những gì đang có, đừng phung phí.' },
    { zh: '造福', py: 'zàofú', vi: 'Tạo phúc: làm một việc tốt nhỏ cho người khác, phúc sẽ quay về với bạn.' },
    { zh: '多福多寿', py: 'duō fú duō shòu', vi: 'Nhiều phúc nhiều thọ: lời chúc dành cho ông bà, cha mẹ.' },
    { zh: '吃亏是福', py: 'chī kuī shì fú', vi: 'Chịu thiệt một chút cũng là phúc. Rộng lượng hôm nay, bình yên ngày mai.' },
    { zh: '祝你幸福', py: 'zhù nǐ xìngfú', vi: 'Chúc bạn hạnh phúc! Hãy nói câu này với người bạn quý nhất hôm nay.' },
    { zh: '福到了', py: 'fú dào le', vi: 'Phúc đến rồi! Chữ 福 dán ngược (倒 dào) đọc giống "đến" (到 dào). Phúc đang gõ cửa nhà bạn.' },
    { zh: '知福惜福', py: 'zhī fú xī fú', vi: 'Biết mình có phúc và biết giữ gìn phúc. Hạnh phúc nằm ở những điều nhỏ bé quanh ta.' },
  ],
};
