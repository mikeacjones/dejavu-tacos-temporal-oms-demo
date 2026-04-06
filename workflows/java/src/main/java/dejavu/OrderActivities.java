package dejavu;

import io.temporal.activity.ActivityInterface;
import io.temporal.activity.ActivityMethod;

import java.util.Map;

@ActivityInterface
public interface OrderActivities {

    @ActivityMethod
    Map<String, Object> validateOrder(OrderInput input);

    @ActivityMethod
    Map<String, Object> validateStore(OrderInput input);

    @ActivityMethod
    Map<String, Object> authorizePayment(OrderInput input);

    @ActivityMethod
    Map<String, Object> clearCart(OrderInput input);

    @ActivityMethod
    Map<String, Object> submitToStore(OrderInput input);

    @ActivityMethod
    Map<String, Object> capturePayment(OrderInput input);

    @ActivityMethod
    Map<String, Object> releasePaymentHold(OrderInput input);

    @ActivityMethod
    Map<String, Object> notifyCustomer(OrderInput input);
}
