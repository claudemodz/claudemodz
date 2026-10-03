export function register(on) {
  on('session.start', async ($, e, next) => {
    await readNotes($)
    return next(e)
  })
}

async function readNotes($) {
  return $.fs.read('NOTES.md').catch(() => '')
}
