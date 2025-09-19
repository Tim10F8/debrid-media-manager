#!/bin/bash

echo "Checking Real Debrid download servers..."
echo "Testing servers 0-99 on both xx-4 and xx-6 endpoints"
echo "================================================"

working_servers_4=()
working_servers_6=()

for i in {0..99}; do
    server_num=$(printf "%02d" $i)

    # Test xx-4 endpoint
    url_4="https://${server_num}-4.download.real-debrid.com/speedtest/test.rar/0.123456"
    if curl -I -s -o /dev/null -w "%{http_code}" --connect-timeout 3 --max-time 5 "$url_4" | grep -qE "^(200|301|302)"; then
        echo "✓ ${server_num}-4 is working"
        working_servers_4+=("${server_num}-4")
    fi

    # Test xx-6 endpoint
    url_6="https://${server_num}-6.download.real-debrid.com/speedtest/test.rar/0.123456"
    if curl -I -s -o /dev/null -w "%{http_code}" --connect-timeout 3 --max-time 5 "$url_6" | grep -qE "^(200|301|302)"; then
        echo "✓ ${server_num}-6 is working"
        working_servers_6+=("${server_num}-6")
    fi
done

echo ""
echo "================================================"
echo "SUMMARY"
echo "================================================"
echo "Working xx-4 servers (${#working_servers_4[@]} total):"
for server in "${working_servers_4[@]}"; do
    echo "  - $server"
done

echo ""
echo "Working xx-6 servers (${#working_servers_6[@]} total):"
for server in "${working_servers_6[@]}"; do
    echo "  - $server"
done

echo ""
echo "Total working servers: $((${#working_servers_4[@]} + ${#working_servers_6[@]}))"