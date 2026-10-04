server {
    listen      %proxy_port%;
    server_name %domain_idn% www.%domain_idn%;

    # HTTP → HTTPS Redirect
    return 301 https://%domain_idn%$request_uri;
}
