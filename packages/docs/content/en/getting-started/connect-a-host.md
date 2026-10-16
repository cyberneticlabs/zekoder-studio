---
title: Connect a host
description: Run agents on another machine or server and control them from ZeKoder Desktop.
navigation:
  order: 1
---

A host is a machine that runs the ZeKoder daemon and your coding agents. ZeKoder Desktop always has one host, your local machine. You can add more.

## When to add a host

- You want agents to run on a home server, a virtual machine, or a cloud instance.
- You want the work to keep running while your laptop is closed.
- You want several devices to see the same agents.

## Prepare the remote machine

1. Install and sign in to the coding agents you want to use on that machine.
2. Install the command line tool and start the daemon:

   ```bash
   npm install -g @getpaseo/cli
   paseo
   ```

3. When asked, choose whether to enable the end-to-end encrypted relay for pairing. If you decline, connect directly over SSH, Tailscale, or another VPN.

## Add the host in ZeKoder Desktop

1. Open **Settings** and choose **Add host**.
2. Pick how to connect:
   - **Remote SSH**: enter an `ssh://user@host` address. ZeKoder uses your local OpenSSH client and your SSH keys.
   - A direct connection to the daemon's address over a network you control, such as Tailscale or another VPN.
3. If the daemon has a password, enter it when prompted.

Once connected, the host appears next to your local machine and its agents show up in the app.

## Keep your code private

Agents run on the host you choose and your code stays on that machine. The optional relay only carries end-to-end encrypted traffic between your devices.
