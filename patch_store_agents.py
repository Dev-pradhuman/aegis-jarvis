#!/usr/bin/env python3

with open('server/store.js', 'r') as f:
    content = f.read()

content = content.replace("export const defaultState = () => ({", "export const defaultState = () => ({\n  agents: [],\n  goals: [],")

with open('server/store.js', 'w') as f:
    f.write(content)
