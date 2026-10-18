import { createElement, render } from 'preact';
import { createBridge } from './webview/bridge';
import { App } from './ui/App';
import './ui/styles/app.css';
import './ui/styles/layout.css';
import './ui/styles/experience.css';
import './ui/styles/syllabus.css';
render(createElement(App, { bridge: createBridge() }), document.getElementById('app')!);
