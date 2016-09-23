var NanoEvents = require('nanoevents')

/**
 * Log is main idea in Logux to store timed events inside.
 *
 * @param {object} opts options
 * @param {Store} opts.store Store for events.
 * @param {Timer} opts.timer Timer to mark events.
 *
 * @example
 * import Log from 'logux-core'
 * const log = new Log({
 *   store: new MemoryStore(),
 *   timer: createTestTimer()
 * })
 *
 * log.on('event', beeper)
 * log.add({ type: 'beep' })
 *
 * @class
 */
function Log (opts) {
  if (!opts) opts = { }

  if (typeof opts.timer !== 'function') {
    throw new Error('Expected log timer to be a function')
  }
  this.timer = opts.timer

  if (typeof opts.store === 'undefined') {
    throw new Error('Expected log store to be a object')
  }
  this.store = opts.store

  this.lastAdded = 0
  this.emitter = new NanoEvents()
}

Log.prototype = {

  /**
   * Subscribe for log events. Supported events:
   *
   * * `event`: when new event was added to log.
   * * `clean`: before log run keepers and remove outdated events.
   *
   * @param {"event"|"clean"} event The event name.
   * @param {listener} listener The listener function.
   *
   * @return {function} Unbind listener from event.
   *
   * @example
   * const unbind = log.on('event', newEvent => {
   *   if (newEvent.type === 'beep') beep()
   * })
   * function disableBeeps () {
   *   unbind()
   * }
   */
  on: function (event, listener) {
    return this.emitter.on(event, listener)
  },

  /**
   * Add one-time listener for log events. Supported events:
   *
   * * `event`: when new event was added to log.
   * * `clean`: before log run keepers and remove outdated events.
   *
   * @param {"event"|"clean"} event The event name.
   * @param {listener} listener The listener function.
   *
   * @return {function} Unbind listener from event.
   *
   * @example
   * log.once('clean', () => {
   *   console.log('Autocleaning works')
   * })
   */
  once: function (event, listener) {
    return this.emitter.once(event, listener)
  },

  /**
   * Add event to log. It will set created (if it missed) and added to meta
   * and call all listeners.
   *
   * @param {Event} event new event
   * @param {object} [meta] open structure for event metadata
   * @param {Time} meta.created event created time
   * @return {boolean} Return `false` if event was already in log
   *
   * @example
   * removeButton.addEventListener('click', () => {
   *   log.add({ type: 'users:remove', user: id })
   * })
   */
  add: function add (event, meta) {
    if (typeof event.type === 'undefined') {
      throw new Error('Expected "type" property in event')
    }

    if (!meta) meta = { }
    if (typeof meta.created === 'undefined') meta.created = this.timer()
    this.lastAdded += 1
    meta.added = this.lastAdded

    var wasAdded = this.store.add([event, meta])

    if (wasAdded) {
      this.emitter.emit('event', event, meta)
    }
    return wasAdded
  },

  /**
   * Remove all unnecessary events. Events could be kept by @link(Log#keep).
   *
   * @return {Promise} when cleaning will be finished
   *
   * @example
   * let sinceClean = 0
   * log.on('event', () => {
   *   sinceClean += 1
   *   if (sinceClean > 100) {
   *     sinceClean = 0
   *     log.clean()
   *   }
   * })
   */
  clean: function clean () {
    this.emitter.emit('clean')
    var self = this
    return this.each(function (event, meta) {
      var keepers = self.emitter.events.keep || []
      var keep = keepers.some(function (keeper) {
        return keeper.fn(event, meta)
      })
      if (!keep) self.store.remove(meta.created)
    })
  },

  /**
   * Add function to keep events from cleaning.
   *
   * @param {keeper} keeper return true for events to keep
   * @return {function} remove keeper from log
   *
   * @example
   * const unkeep = log.keep((event, meta) => {
   *   return compareTime(meta.created, lastBeep) > 0
   * })
   * function uninstallPlugin () {
   *   unkeep()
   * }
   */
  keep: function keep (keeper) {
    return this.emitter.on('keep', keeper)
  },

  /**
   * Iterates through all event, from last event to first.
   *
   * Return false from callback if you want to stop iteration.
   *
   * @param {object} [opts] iterator options
   * @param {'added'|'created'} opts.order get events by created or added time.
   *                                       Default is `'created'`.
   * @param {iterator} callback function will be executed on every event
   * @return {Promise} when iteration will be finished by iterator or events end
   *
   * @example
   * log.each((event, meta) => {
   *   if ( compareTime(meta.created, lastBeep) <= 0 ) {
   *     return false;
   *   } else if ( event.type === 'beep' ) {
   *     beep()
   *     lastBeep = meta.created
   *     return false;
   *   }
   * })
   */
  each: function each (opts, callback) {
    if (!callback) {
      callback = opts
      opts = { }
    }

    var store = this.store
    return new Promise(function (resolve) {
      function nextPage (get) {
        get().then(function (page) {
          for (var i = 0; i < page.data.length; i++) {
            var entry = page.data[i]
            var result = callback(entry[0], entry[1])
            if (result === false) break
          }

          if (result === false || !page.next) {
            resolve()
          } else {
            nextPage(page.next)
          }
        })
      }

      nextPage(store.get.bind(store, opts.order || 'created'))
    })
  }
}

module.exports = Log

/**
 * Unique event ID.
 * Array of comparable native types (like number or string).
 *
 * @typedef {array} Time
 *
 * @example
 * [1, 'host']
 */

/**
 * Log’s event.
 *
 * @typedef {object} Event
 * @property {string} type Event type name.
 */

/**
 * Event metadata
 *
 * @typedef {object} Meta
 * @property {Time} created Event occurred time. {@link Log#add} will fill it,
 *                          if field will be empty.
 * @property {number} added Event added sequence number.
 *                          {@link Log#add} will fill it.
 */

/**
 * Every log store should provide two methods: add and get.
 *
 * @typedef {object} Store
 * @property {function} add    Add new event to store. Event always will
 *                             have type and time properties. Returns false
 *                             if event was already in log.
 * @property {function} get    Return a Promise with events “page”.
 *                             Page is a object with events in `data` property
 *                             and function `next` to return Promise with
 *                             next page. Last page should not have `next`.
 * @property {function} remove Remove event from store.
 */

/**
 * Returns current time. Time should be unique for every call.
 *
 * @typedef {function} Timer
 * @return {Time}
 */

/**
 * @callback listener
 * @param {Event} event New event.
 * @param {Meta} meta The event metadata.
 */

/**
 * @callback iterator
 * @param {Event} event Next event.
 * @param {Meta} meta Next event metadata.
 * @return {boolean} returning `false` will stop iteration.
 */

/**
 * @callback keeper
 * @param {Event} event Next event.
 * @param {Meta} meta Next event metadata.
 * @return {boolean} true If event should be kept from cleaning.
 */
