// The glue around the install dialog: when it counts as already installed, and
// that the browser's install event reaches the dialog whichever of the two is
// ready first (Chromium fires the event once, early; the dialog loads later).
import { describe, expect, it, vi } from 'vitest'
import { createInstallGuide, isStandalone, type PwaInstallElement } from '../../app/utils/install-guide'

const dialog = () => ({ showDialog: vi.fn() }) as unknown as PwaInstallElement & { showDialog: ReturnType<typeof vi.fn> }
const event = () => new Event('beforeinstallprompt')

describe('already installed?', () => {
  it('is the standalone display mode', () => {
    expect(isStandalone({ matchMedia: () => ({ matches: true }) as MediaQueryList })).toBe(true)
    expect(isStandalone({ matchMedia: () => ({ matches: false }) as MediaQueryList })).toBe(false)
  })

  it('is what iPhone reports as navigator.standalone', () => {
    expect(isStandalone({ matchMedia: () => ({ matches: false }) as MediaQueryList, navigator: { standalone: true } })).toBe(true)
  })

  it('is not, when the browser can tell us nothing', () => {
    expect(isStandalone({})).toBe(false)
  })

  it('asks about the standalone display mode and nothing else', () => {
    const matchMedia = vi.fn(() => ({ matches: false }) as MediaQueryList)
    isStandalone({ matchMedia })
    expect(matchMedia).toHaveBeenCalledWith('(display-mode: standalone)')
  })
})

describe('the install dialog', () => {
  it('opens, forcing it, once it is on the page', () => {
    const guide = createInstallGuide()
    const el = dialog()
    guide.register(el)
    expect(guide.open()).toBe(true)
    expect(el.showDialog).toHaveBeenCalledWith(true)
  })

  it('says so, and does nothing, when it is not on the page yet', () => {
    expect(createInstallGuide().open()).toBe(false)
  })

  it('does not open a dialog that has gone', () => {
    const guide = createInstallGuide()
    const el = dialog()
    guide.register(el)
    guide.unregister()
    expect(guide.open()).toBe(false)
    expect(el.showDialog).not.toHaveBeenCalled()
  })

  it('hands over an install event that fired before the dialog was there', () => {
    const guide = createInstallGuide()
    const early = event()
    guide.capture(early)
    const el = dialog()
    guide.register(el)
    expect(el.externalPromptEvent).toBe(early)
  })

  it('hands over an install event that fires after the dialog is there', () => {
    const guide = createInstallGuide()
    const el = dialog()
    guide.register(el)
    const late = event()
    guide.capture(late)
    expect(el.externalPromptEvent).toBe(late)
  })

  it('gives a new dialog the event too, when the page changes layout and back', () => {
    const guide = createInstallGuide()
    const prompt = event()
    guide.capture(prompt)
    guide.register(dialog())
    guide.unregister()
    const second = dialog()
    guide.register(second)
    expect(second.externalPromptEvent).toBe(prompt)
  })

  it('gives nothing when no install event has fired, as on Safari', () => {
    const guide = createInstallGuide()
    const el = dialog()
    guide.register(el)
    expect(el.externalPromptEvent).toBeUndefined()
  })
})
