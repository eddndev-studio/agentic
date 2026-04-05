import React from 'react';
import { MonitorProvider } from './MonitorProvider';
import { MonitorApp } from './components/MonitorApp';

export default function MonitorIsland() {
    return (
        <MonitorProvider>
            <MonitorApp />
        </MonitorProvider>
    );
}
