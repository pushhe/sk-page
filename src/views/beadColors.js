// beadColors.js
export const BEAD_PALETTE = [
  // 基础色系
  { id: 'P01', name: '白色 White', r: 255, g: 255, b: 255, hex: '#FFFFFF' },
  { id: 'P02', name: '黑色 Black', r: 45, g: 45, b: 47, hex: '#2D2D2F' },
  { id: 'P12', name: '灰色 Grey', r: 149, g: 153, b: 156, hex: '#95999C' },
  { id: 'P90', name: '浅灰 Lt. Grey', r: 171, g: 173, b: 176, hex: '#ABADB0' },
  // 红色系
  { id: 'P03', name: '红色 Red', r: 190, g: 40, b: 50, hex: '#BE2832' },
  { id: 'P38', name: '樱桃红 Cherry', r: 164, g: 30, b: 51, hex: '#A41E33' },
  { id: 'P88', name: '火红 Hot Coral', r: 255, g: 82, b: 90, hex: '#FF525A' },
  // 蓝色系
  { id: 'P08', name: '深蓝 Dark Blue', r: 40, g: 55, b: 130, hex: '#283782' },
  { id: 'P09', name: '浅蓝 Light Blue', r: 75, g: 175, b: 225, hex: '#4BAFE1' },
  { id: 'P62', name: '天蓝 Sky', r: 110, g: 187, b: 223, hex: '#6EBBDF' },
  { id: 'P04', name: '蓝莓 Blueberry', r: 59, g: 68, b: 137, hex: '#3B4489' },
  // 绿色系
  { id: 'P18', name: '鹦鹉绿 Parrot Gr.', r: 50, g: 165, b: 75, hex: '#32A54B' },
  { id: 'P06', name: '深绿 Dark Green', r: 40, g: 95, b: 70, hex: '#285F46' },
  { id: 'P35', name: '奇异果 Kiwi', r: 150, g: 200, b: 70, hex: '#96C846' },
  // 黄色/橙色系
  { id: 'P05', name: '黄色 Yellow', r: 245, g: 210, b: 30, hex: '#F5D21E' },
  { id: 'P11', name: '橙色 Orange', r: 240, g: 100, b: 45, hex: '#F0642D' },
  { id: 'P60', name: '金黄 Butterscotch', r: 224, g: 151, b: 55, hex: '#E09737' },
  { id: 'P33', name: '桃色 Peach', r: 250, g: 170, b: 145, hex: '#FAAA91' },
  // 紫色系
  { id: 'P07', name: '紫色 Purple', r: 125, g: 55, b: 150, hex: '#7D3796' },
  { id: 'P13', name: '浅紫 Plum', r: 141, g: 82, b: 147, hex: '#8D5293' },
  // 棕色系
  { id: 'P17', name: '棕色 Brown', r: 85, g: 60, b: 50, hex: '#553C32' },
  { id: 'P20', name: '浅棕 Tan', r: 185, g: 140, b: 105, hex: '#B98C69' },
  { id: 'P70', name: '赭石 Rust', r: 150, g: 65, b: 50, hex: '#964132' },
  // ... 可根据需要继续增加
]

// 预处理函数：为了提高计算性能，预先计算 LAB 值或灰度值可以在这里扩展
export const getBeadColorById = (id) => BEAD_PALETTE.find((c) => c.id === id)
