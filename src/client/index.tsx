import * as ReactDOM from 'react-dom';
import { App } from './components/app';

window.addEventListener("load", () => {
    ReactDOM.render(<App />, document.querySelector("#container"));
})