package com.virux.app.filetransfer

import org.webrtc.DataChannel
import java.nio.ByteBuffer

/**
 * Observer for DataChannel lifecycle, incoming messages, and buffer drainage.
 */
interface ViruxDataChannelObserver {
    fun onStateChange(isOpen: Boolean)
    fun onMessage(text: String?, binaryData: ByteArray?)
    fun onBufferedAmountChange(previousAmount: Long)
}

/**
 * Interface abstracting WebRTC DataChannel operations.
 * Allows decoupling the transfer protocol from the underlying native JNI runtime.
 */
interface ViruxDataChannel {
    val label: String
    val id: Int
    fun isOpen(): Boolean
    fun bufferedAmount(): Long
    fun sendText(text: String): Boolean
    fun sendBinary(data: ByteArray): Boolean
    fun registerObserver(observer: ViruxDataChannelObserver)
    fun unregisterObserver()
    fun close()
}

/**
 * Production implementation of ViruxDataChannel backed by native org.webrtc.DataChannel.
 */
class NativeViruxDataChannel(
    private val dataChannel: DataChannel
) : ViruxDataChannel {

    private var activeObserver: ViruxDataChannelObserver? = null

    override val label: String
        get() = try { dataChannel.label() } catch (e: Exception) { "unknown" }

    override val id: Int
        get() = try { dataChannel.id() } catch (e: Exception) { -1 }

    override fun isOpen(): Boolean = try {
        dataChannel.state() == DataChannel.State.OPEN
    } catch (e: Exception) {
        false
    }

    override fun bufferedAmount(): Long = try {
        dataChannel.bufferedAmount()
    } catch (e: Exception) {
        0L
    }

    override fun sendText(text: String): Boolean = try {
        val bytes = text.toByteArray(Charsets.UTF_8)
        val buffer = ByteBuffer.wrap(bytes)
        dataChannel.send(DataChannel.Buffer(buffer, false))
    } catch (e: Exception) {
        false
    }

    override fun sendBinary(data: ByteArray): Boolean = try {
        val buffer = ByteBuffer.wrap(data)
        dataChannel.send(DataChannel.Buffer(buffer, true))
    } catch (e: Exception) {
        false
    }

    override fun registerObserver(observer: ViruxDataChannelObserver) {
        this.activeObserver = observer
        dataChannel.registerObserver(object : DataChannel.Observer {
            override fun onBufferedAmountChange(previousAmount: Long) {
                observer.onBufferedAmountChange(previousAmount)
            }

            override fun onStateChange() {
                val state = dataChannel.state()
                observer.onStateChange(state == DataChannel.State.OPEN)
            }

            override fun onMessage(buffer: DataChannel.Buffer) {
                if (buffer.binary) {
                    val bytes = ByteArray(buffer.data.remaining())
                    buffer.data.get(bytes)
                    observer.onMessage(null, bytes)
                } else {
                    val bytes = ByteArray(buffer.data.remaining())
                    buffer.data.get(bytes)
                    val str = String(bytes, Charsets.UTF_8)
                    observer.onMessage(str, null)
                }
            }
        })
    }

    override fun unregisterObserver() {
        activeObserver = null
        try {
            dataChannel.unregisterObserver()
        } catch (e: Exception) {}
    }

    override fun close() {
        unregisterObserver()
        try {
            dataChannel.close()
            dataChannel.dispose()
        } catch (e: Exception) {}
    }
}

