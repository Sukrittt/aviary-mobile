import type * as Module from './downscaleImage'

let mockMissing = false
jest.mock('expo', () => ({ requireOptionalNativeModule: () => (mockMissing ? null : {}) }))
const mockResize = jest.fn()
const mockSave = jest.fn()
const mockRelease = jest.fn()
jest.mock('expo-image-manipulator', () => {
  if (mockMissing) throw new Error("Cannot find native module 'ExpoImageManipulator'")
  return {
    SaveFormat: { JPEG: 'jpeg' },
    ImageManipulator: {
      manipulate: () => {
        const context = {
          resize: (size: unknown) => (mockResize(size), context),
          renderAsync: async () => ({ saveAsync: mockSave, release: mockRelease }),
          release: mockRelease,
        }
        return context
      },
    },
  }
})

// The native probe runs at import, so each case loads the module fresh.
function load(): typeof Module {
  let mod: typeof Module | undefined
  jest.isolateModules(() => {
    mod = jest.requireActual<typeof Module>('./downscaleImage')
  })
  return mod!
}
const { BILL_ENCODING, PHOTO_ENCODING } = jest.requireActual<typeof Module>('./downscaleImage')

beforeEach(() => {
  jest.clearAllMocks()
  mockMissing = false
  mockSave.mockResolvedValue({ uri: 'file:///small.jpg', base64: 'c21hbGw=' })
})

it('shrinks the long edge of a camera photo and re-encodes it as JPEG', async () => {
  expect(await load().downscaleImage({ uri: 'file:///big.jpg', width: 4000, height: 3000 }, PHOTO_ENCODING)).toEqual({ uri: 'file:///small.jpg', base64: 'c21hbGw=', mimeType: 'image/jpeg' })
  expect(mockResize).toHaveBeenCalledWith({ width: 1280 })
  expect(mockSave).toHaveBeenCalledWith({ compress: 0.8, format: 'jpeg', base64: true })
  // Both the context and the rendered bitmap are freed.
  expect(mockRelease).toHaveBeenCalledTimes(2)
})

it('fits a tall receipt by its height', async () => {
  await load().downscaleImage({ uri: 'file:///bill.jpg', width: 3000, height: 4000 }, BILL_ENCODING)
  expect(mockResize).toHaveBeenCalledWith({ height: 2000 })
  expect(mockSave).toHaveBeenCalledWith(expect.objectContaining({ compress: 0.7 }))
})

it('leaves an image that already fits alone', async () => {
  expect(await load().downscaleImage({ uri: 'file:///s.jpg', width: 1280, height: 720 }, PHOTO_ENCODING)).toBeNull()
  expect(mockResize).not.toHaveBeenCalled()
})

it("falls back to the picker's image on a build without the native module", async () => {
  mockMissing = true
  expect(await load().downscaleImage({ uri: 'file:///big.jpg', width: 4000, height: 3000 }, PHOTO_ENCODING)).toBeNull()
})

it("falls back when saving fails", async () => {
  mockSave.mockRejectedValue(new Error('out of memory'))
  expect(await load().downscaleImage({ uri: 'file:///big.jpg', width: 4000, height: 3000 }, PHOTO_ENCODING)).toBeNull()
  expect(mockRelease).toHaveBeenCalledTimes(2)
})
