import { h, render, Component } from 'preact'
import Background, { StateType as BackgroundStateType } from './background'
import QuickInfo, { QuickInfoState } from './quick-info'

export function renderToDOM($background: HTMLElement, $quickInfo: HTMLElement) {
  let background: Component<undefined, BackgroundStateType>
  let quickInfo: Component<undefined, QuickInfoState>
  render(<Background ref={(ref: any) => (background = ref)} />, $background)
  render(<QuickInfo ref={(ref: any) => (quickInfo = ref)} />, $quickInfo)
  return function setState(state: BackgroundStateType) {
    background.setState(state)
    quickInfo.setState(state.quickInfo || {})
  }
}
