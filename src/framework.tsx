import * as React from 'react';
import * as Mobx from 'mobx'
import { Observer } from 'mobx-react'

const LibName = 'crazy modo components'

type Observable<T> = T
type Value<T> = Observable<{ value: T }>
type UnwrapValues<T> = {
  [K in keyof T]: T[K] extends Value<infer V> ? V : T[K]
}

type RestrictiveBindings = {
  [key: string]: Value<any> | Mobx.IObservable | ((...args: any[]) => any)
}

export interface ComponentSpec<
  Props extends { [key: string]: any },
  Bindings extends RestrictiveBindings,
  State = UnwrapValues<Bindings>
> {
  setup: (props: Observable<Props>) => Bindings
  render: <S extends State>(args: Props & S) => React.ReactElement
  displayName?: string
}

type ComponentKey = Symbol

class GlobalHookRegistryImplementation {
  hooks = new Map<ComponentKey, HookWrapper<any>[]>()
  private currentComponent?: ComponentKey

  start(component: ComponentKey) {
    if (this.currentComponent) {
      throw new Error('Cannot register two components at once')
    }
    this.currentComponent = component
  }

  finish(component: ComponentKey): HookWrapper<any>[] {
    if (!this.currentComponent) {
      throw new Error('No component registered')
    }

    if (this.currentComponent !== component) {
      throw new Error(`Mismatch, have ${this.currentComponent}, trying to unregister ${component}`)
    }

    this.currentComponent = undefined
    const result = this.hooks.get(component) || []
    this.hooks.delete(component)
    return result
  }

  registerHookForTarget<T extends HookWrapper<any>>(fn: () => T): T {
    if (!this.currentComponent) {
      throw new Error('Cannot create hooks without registering component')
    }

    const result = fn()
    const hooks = this.hooks.get(this.currentComponent) || []
    this.hooks.set(this.currentComponent, hooks)
    hooks.push(result)

    return result
  }
}

const GlobalHookRegistry = new GlobalHookRegistryImplementation()

/**
 * Wrap a regular react hook to make it observe its arguments.
 *
 * @arg reactHook - a standard React hook function like `useLayoutEffect`
 * @arg getArgs - compute the args for the react hook. The dependencies of getArgs
 *      are automatically tracked by a Mobx observable system.
 */
function observeHook<HA extends unknown[], HR>(
  reactHook: (...args: HA) => HR,
  getArgs: () => HA // Observer
): HookWrapper<HR> {
    return {
      call() {
        return reactHook(...getArgs())
      }
    }
}

interface HookWrapper<HR> {
  call(): HR
}

/**
 * fake hook
 */
export function value<T>(initial: T): Value<T> {
  return Mobx.observable.object({ value: initial })
}

/**
 * fake hook
 */
export function computed<T>(getter: () => T): Value<T> {
  return Mobx.observable.object({
    get value() {
      return getter()
    }
  })
}

function equal<T>(a: T, b: T): boolean {
  return a === b
}

function updateProps<
Props extends { [key: string]: any },
>(original: Observable<Props>, now: Props, ignores: { [key: string]: any }): void {
  // New and updated props
  for (const k of Object.keys(now)) {
    if (ignores.hasOwnProperty(k)) {
      console.log('ignore update for', k)
    }

    const oldV = original[k]
    const newV = now[k]
    if (!equal(oldV, newV)) {
      console.log('update', original, k, 'to', newV);
      (original as any)[k] = newV
    }
  }

  // deleted props
  for (const k of Object.keys(original)) {
    if (!now.hasOwnProperty(k)) {
      if (ignores.hasOwnProperty(k)) {
        console.log('ignore delete', k)
        continue
      }

      console.log('delete', original, k)
      delete original[k]
    }
  }
}

export function createComponent<
  Props extends { [key: string]: any },
  Bindings extends RestrictiveBindings
>(args: ComponentSpec<Props, Bindings>): React.FC<Props> {
  type EffectfulState = {
    hooks: HookWrapper<any>[]
    bindings: Bindings
    observableProps: Observable<Props>
    renderArgs: Observable<Props & UnwrapValues<Bindings>>
  }

  function Component(props: Props) {
    const crazy = React.useRef<EffectfulState | undefined>(undefined)
    if (!crazy.current) {
      console.log('First render')

      const observableProps = Mobx.observable(props)

      const target = Symbol(`hooks for ${args.displayName || LibName}`)
      GlobalHookRegistry.start(target)
      const bindings = args.setup(observableProps)
      const hooks = GlobalHookRegistry.finish(target)

      const renderArgs = { ...props }
      for (const [k, v] of Object.entries(bindings)) {
        if ('value' in v) {
          Object.defineProperty(renderArgs, k, {
            get() { return v.value }
          })
        } else {
          (renderArgs as any)[k] = v
        }
      }

      crazy.current = {
        observableProps,
        bindings,
        hooks,
        renderArgs: renderArgs as any,
      }
    } else {
      console.log('Next render')
      const { hooks, observableProps, renderArgs, bindings } = crazy.current
      // Update observable props, which should reflow.
      updateProps(observableProps, props, bindings)
      updateProps(renderArgs, props, bindings)

      // Call each hook
      for (const hook of hooks) {
        hook.call()
      }
    }

    return <Observer>
      {() => args.render((crazy.current as EffectfulState).renderArgs)}
    </Observer>
  }


  Component.displayName = args.displayName
  return Component
}
