/// <reference types="safari-extension-content" />
import Adapter from './adapter'
import { MessageFromBackground, SendMessageToBackground } from '../types'

declare global {
  interface Window {
    OCTOHINT_ON_MESSAGE: (message: MessageFromBackground) => void
  }
}

window.OCTOHINT_ON_MESSAGE = () => {}

class SafariAdapter extends Adapter {
  getSendMessage(): SendMessageToBackground {
    return (data, cb) => {
      window.OCTOHINT_ON_MESSAGE = cb
      safari.self.tab.dispatchMessage('from page', data)
    }
  }

  constructor() {
    safari.self.addEventListener(
      'message',
      (res: { message: MessageFromBackground }) => {
        window.OCTOHINT_ON_MESSAGE(res.message)
      },
      false,
    )
    super()
  }
}

new SafariAdapter()
