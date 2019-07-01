import React from 'react';
import logo from './logo.svg';
import './App.css';

import * as framework from './framework'

const Counter = framework.createComponent({
  setup(props: { by: number, initial: number, onChange(x: number): void }) {
    const state = framework.value(props.initial)
    function increment() {
      state.value = state.value + props.by
      props.onChange(state.value)
    }
    function decrement() {
      state.value = state.value - props.by
      props.onChange(state.value)
    }

    return { increment, decrement, state  }
  },
  render(args) {
    const { increment, decrement, state, by } = args
    return <span style={{border: '1px solid black'}}>
      <button onClick={decrement}>- {by}</button>
      {' '}
      {state}
      {' '}
      <button onClick={increment}>+ {by}</button>
    </span>
  }
})

const noop = () => undefined

const App: React.FC = () => {
  const [by, setBy] = React.useState(1)
  return (
    <div className="App">
      <Counter by={1} initial={0} onChange={setBy} />
      <Counter by={by} initial={0} onChange={noop} />
    </div>
  );
}

export default App;
