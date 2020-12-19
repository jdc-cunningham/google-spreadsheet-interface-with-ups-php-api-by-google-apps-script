<?php
  function getEnvVars() {
    $env_lines = explode("\n", file_get_contents('.env', true));
    $env_vars = [];

    foreach ($env_lines as $env_line) {
      $env_line_parts = explode('=', $env_line);
      $env_vars[$env_line_parts[0]] = $env_line_parts[1];
    }

    return $env_vars;
  }
