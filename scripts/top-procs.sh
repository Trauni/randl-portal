#!/bin/bash
ps aux --sort=-%cpu | awk 'NR>1 && $11!="" && $11!~/^\[/ {print $11"|"$3"|"$4}' | head -8
