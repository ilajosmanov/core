import { LoguxError } from '..'

// THROWS type '10' is not assignable to parameter of type 'void | undefined'.
new LoguxError('bruteforce', 10)
// THROWS '{ a: number; }' is not assignable to parameter of type 'Versions'.
new LoguxError('wrong-protocol', { a: 1 })
