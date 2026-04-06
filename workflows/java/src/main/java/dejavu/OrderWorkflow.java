package dejavu;

import io.temporal.workflow.QueryMethod;
import io.temporal.workflow.SignalMethod;
import io.temporal.workflow.WorkflowInterface;
import io.temporal.workflow.WorkflowMethod;

import java.util.Map;

@WorkflowInterface
public interface OrderWorkflow {

    @WorkflowMethod
    Map<String, Object> run(Map<String, Object> orderInput);

    @SignalMethod(name = "order_ready")
    void orderReady();

    @QueryMethod(name = "get_status")
    String getStatus();
}
