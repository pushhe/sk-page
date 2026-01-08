import request from '@/utils/request.js'

const BaseUrl = 'https://uapis.cn'

export function getWeather() {
  return request({
    url: `${BaseUrl}/api/v1/misc/weather`,
    method: 'get',
    params: {
      city: '北京',
      adcode: '110000',
    },
    loading: true,
  })
}

export function getHotBoard(type) {
  return request({
    url: `${BaseUrl}/api/v1/misc/hotboard`,
    method: 'get',
    params: {
      type,
    },
    loading: false,
  })
}
