/**
 * 模拟登录河南理工大学教务处URP系统
 * MIT Copyright (c) 2017 Jeneser
 * Source: https://github.com/hpufe/fsociety-hpu
 *
 * rsa-node
 * RSA加密算法库，用于加密VPN密码
 * MIT Copyright (c) 2017 Jeneser
 * Source: https://github.com/jeneser/rsa-node
 *
 * ocr
 * Tesseract自动识别教务处URP系统验证码
 * MIT Copyright (c) 2017 Jeneser
 * Source: https://github.com/jeneser/rsa-node
 */

var path = require('path')
var fs = require('fs')
var gm = require('gm')
var RsaNode = require('rsa-node')
var tesseract = require('node-tesseract')
var request = require('superagent')
require('superagent-charset')(request)

// 配置
var config = {
  // RSA加密参数
  KEY: 'D41F1B452440585C5D1F853C7CBCB2908CFF324B43A42D7D77D2BB28BD64E2D098079B477D23990E935386FF73CCF865E0D84CE64793306C4083EADECFE36BCC89873EC2BA37D6CA943CB03BA5B4369EE7E31C3539DEA67FF8BF4A5CEE64EB3FD0639E78044B12C7B1D07E86EB7BCF033F78947E0ADE5653B9A88B33AFEB53BD',
  EXP: 65537,

  // OCR参数
  ocr: {
    config: {
      // 临时验证码存放路径，默认输出到当前路径
      dist: path.join(__dirname),
      suffix: '.jpeg',
      // 调整对比度
      contrast: -100,
      // 调整大小
      resize: {
        w: 240,
        h: 80
      }
    },
    options: {
      // 使用已被训练的hpu语言
      l: 'hpu',
      psm: 7,
      binary: 'tesseract'
    },
    // 尝试次数flag
    // node-tesseract库不稳定
    // TODO: 使用更稳定的库
    times: 0
  },

  // VPN参数
  vpnLoginUrl: 'https://vpn.hpu.edu.cn/por/login_psw.csp?sfrnd=2346912324982305&encrypt=1',
  vpnLoginHeader: {
    Host: 'vpn.hpu.edu.cn',
    Accept: 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
    'User-Agent': 'Mozilla/5.0 (X11; Ubuntu; Linux x86_64; rv:55.0) Gecko/20100101 Firefox/55.0',
    'Content-Type': 'application/x-www-form-urlencoded',
    'Accept-Language': 'en-US,en;q=0.5',
    'Accept-Encoding': 'gzip, deflate, br',
    Connection: 'keep-alive',
    'Upgrade-Insecure-Requests': '1',
    'Cache-Control': 'max-age=0',
    Referer: 'https://vpn.hpu.edu.cn/por/login_psw.csp?rnd=0.4288785251262913#http%3A%2F%2Fvpn.hpu.edu.cn%2F',
    Cookie: 'language=en_US; TWFID=1683ff4c80034a2e; collection=%7Bauto_login_count%3A0%7D; VpnLine=http%3A%2F%2Fvpn.hpu.edu.cn%2F; g_LoginPage=login_psw; VisitTimes=0; haveLogin=0'
  },

  // 教务处URP系统参数
  // urpIndex: 'https://vpn.hpu.edu.cn/web/1/http/0/218.196.240.97/',
  urpLoginUrl: 'https://vpn.hpu.edu.cn/web/1/http/1/218.196.240.97/loginAction.do',
  urpVerCode: 'https://vpn.hpu.edu.cn/web/0/http/1/218.196.240.97/validateCodeAction.do?random=0.5239535101287284',
  urpLoginHeader: {
    Host: 'vpn.hpu.edu.cn',
    'User-Agent': 'Mozilla/5.0 (X11; Ubuntu; Linux x86_64; rv:55.0) Gecko/20100101 Firefox/55.0',
    Accept: 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
    'Accept-Language': 'en-US,en;q=0.5',
    'Accept-Encoding': 'gzip, deflate, br',
    Referer: 'https://vpn.hpu.edu.cn/web/1/http/0/218.196.240.97/',
    Connection: 'keep-alive',
    'Upgrade-Insecure-Requests': '1',
    'Cache-Control': 'max-age=0'
  },

  // 网络超时 3s
  timeout: 3000
}

/**
 * 自动识别URP系统验证码
 * 递归识别，确保返回正确数据
 * TODO: 训练更多数据以提高识别率
 * @param {*} verCode 原始验证码图片
 * @return {Promise} Promise()
 */
function ocr (agent, fileName) {
  return new Promise((resolve, reject) => {
    // 验证码暂存路径
    var verCodePath = path.join(
      config.ocr.config.dist,
      fileName + config.ocr.config.suffix
    );
    // 识别验证码
    (function _ocr () {
      agent
        .get(config.urpVerCode)
        .timeout({
          response: config.timeout
        })
        .then(verCode => {
          return new Promise((_resolve, _reject) => {
            // 创建写流
            var verCodeWriteStream = fs.createWriteStream(verCodePath)
            // 处理图片
            gm(verCode.body)
              // 减少图像中的斑点
              .despeckle()
              // 调整对比度
              .contrast(config.ocr.config.contrast)
              // 调整大小
              .resize(config.ocr.config.resize.w, config.ocr.config.resize.h)
              // 写入磁盘
              .stream()
              .pipe(verCodeWriteStream)
            // 监听
            verCodeWriteStream.on('close', () => {
              _resolve('验证码预处理成功')
            })
            verCodeWriteStream.on('error', () => {
              _reject(new Error('磁盘写入出错'))
            })
          }).then(() => {
            // 检查文件是否存在
            if (fs.existsSync(verCodePath)) {
              // Tesseract-ocr识别验证码
              tesseract.process(
                verCodePath,
                config.ocr.options,
                (err, data) => {
                  if (err) {
                    // 递归，尝试3次
                    if (config.ocr.times < 3) {
                      _ocr()
                      config.ocr.times++
                    } else {
                      reject(new Error('验证码识别出错'))
                    }
                  } else {
                    var ver = new RegExp('^[a-zA-Z0-9]{4}$')
                    if (ver.test(data.trim())) {
                      // 识别成功，删除临时文件
                      if (fs.existsSync(verCodePath)) {
                        fs.unlink(verCodePath)
                      }
                      // 返回结果
                      resolve(data.trim())
                    } else {
                      // 再次识别
                      _ocr()
                    }
                  }
                }
              )
            } else {
              // 再次识别
              _ocr()
            }
          })
        })
        .catch(err => {
          reject(err)
        })
    })()
  })
}

/**
 * 模拟登录
 * @param {Object} params 配置参数
 * @param {Number} studentId 学号/一卡通号
 * @param {Number} vpnPassWord vpn密码
 * @param {Number} jwcPassWord 教务处密码
 * @param {String} url 要访问的教务资源
 * @param {String} method 请求方法
 * @return {Promise} Promise
 */
exports.login = function (params) {
  params = params || {}

  // 禁用https
  process.env.NODE_TLS_REJECT_UNAUTHORIZED = 0

  // 保存Cookie
  var agent = request.agent()

  // 初始化RSA加密算法
  var rsa = new RsaNode(config.KEY, config.EXP)

  if (params.studentId && params.vpnPassWord && params.jwcPassWord) {
    return (
      // 登录VPN
      agent
      .post(config.vpnLoginUrl)
      .set(config.vpnLoginHeader)
      .type('form')
      .send({
        svpn_name: params.studentId
      })
      .send({
        svpn_password: rsa.encrypt(params.vpnPassWord)
      })
      .timeout({
        response: config.timeout
      })
      .redirects()
      // 识别URP验证码
      .then(() => {
        return Promise.resolve(ocr(agent, params.studentId))
      })
      // 登录URP
      .then(verCodeIdentified => {
        return agent
          .post(config.urpLoginUrl)
          .set(config.urpLoginHeader)
          .type('form')
          .send({
            zjh1: '',
            tips: '',
            lx: '',
            evalue: '',
            eflag: '',
            fs: '',
            dzslh: ''
          })
          .send({
            zjh: params.studentId,
            mm: params.jwcPassWord,
            v_yzm: verCodeIdentified
          })
          .timeout({
            response: config.timeout
          })
          .redirects()
      })
      // 登录成功,访问教务资源
      .then(() => {
        if (params.method.toLowerCase() === 'post') {
          return Promise.resolve(agent)
        } else {
          return agent.get(params.url).charset('gbk')
        }
      })
    )
  } else {
    return Promise.reject(new Error('参数错误'))
  }
}
