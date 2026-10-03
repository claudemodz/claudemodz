export function register(on) {
  on('ui.render', { component: 'Pane' }, ($, e, next) => next(e))
  on('session.start', async ($, e, next) => {
    await $.process.run(['gh', 'pr', 'view'])
    await $.env.get('GITHUB_TOKEN')
    return next(e)
  })
}
